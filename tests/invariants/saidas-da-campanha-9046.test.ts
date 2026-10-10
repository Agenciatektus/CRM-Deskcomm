import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9046: A COLUNA DAS SAÍDAS EXISTE, ACEITA OBJETO E NASCE NULA.
 *
 * ## O que este invariante guarda, e o que ele NÃO guarda
 *
 * A decisão de desenho da fatia é que uma configuração de saída ilegível PARA a
 * régua em vez de cair no padrão, e quem faz isso é TypeScript:
 * `lerSaidasDaCampanha` recusa o que o Zod não aceita, `problemaNasSaidas` barra
 * o gate de `faltaParaEnviar` e `politicaDaRegua` devolve recusa em vez de
 * política. Isso está provado em `lib/campanhas/saidas-da-campanha.test.ts` e em
 * `lib/campanhas/regua.test.ts`, que rodam sem banco.
 *
 * O que SÓ o banco pode provar é o piso: que a coluna existe numa instalação que
 * aplicou apenas o `baseline.sql` (`install.sh` e `update.sh` não rodam a cadeia
 * de migrations), que ela NASCE NULA — é a nulidade que preserva o
 * comportamento de toda campanha anterior à 9046 — e que o CHECK está de pé para
 * recusar o que não é objeto, inclusive pela PostgREST com service_role, que não
 * passa pelo Zod das rotas.
 *
 * ## Por que cada caso
 *
 *  1. A constraint existe e é CHECK em `campaigns`. É o controle da própria
 *     suíte: sem ele, os casos de recusa passariam num banco SEM a constraint
 *     pelo motivo errado, e "não falhou" é o que alguns deles afirmam.
 *  2. Campanha nasce com `saidas` NULA. É o caso que diz "nenhuma campanha
 *     existente mudou de comportamento": nula é o padrão, e o padrão é o literal
 *     que a 9046 substituiu.
 *  3. Objeto PASSA, e volta como foi gravado (controle positivo: sem ele, 4 e 5
 *     passariam também num CHECK escrito errado que recusasse tudo).
 *  4. Array é recusado (23514). É a forma mais provável de confusão com
 *     `campaigns.passos`, a coluna vizinha, que é array.
 *  5. String e número são recusados. Um `'"nao"'::jsonb` é jsonb válido, então o
 *     erro de digitação "gravei o rótulo em vez do objeto" existe de verdade.
 *  6. OBJETO ILEGÍVEL é ACEITO. É o controle positivo da decisão de desenho:
 *     `duplicarAcao` copia o objeto ilegível COMO ESTÁ, para a cópia herdar a
 *     recusa em vez de virar o padrão por conta própria, e isso exige que o
 *     banco aceite gravá-lo. Quem endurecer o CHECK amanhã quebra essa herança,
 *     e sem este caso a suíte não acusaria — nenhum outro grava malformado.
 *  7. NULO explícito continua aceito depois de a campanha ter sido configurada:
 *     é como se volta ao padrão pela tela.
 *
 * Tudo em transação desfeita (`rollback`), como as irmãs. Zero PII.
 */

const id = (n: number) => `90460000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG = id(1);
const SESSAO = id(2);
const CAMP = id(3);

const seed = `
begin;
insert into organizations(id,slug,display_name,legal_name)
  values ('${ORG}','e9046','E9046','E9046');
insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted)
  values ('${SESSAO}','${ORG}','e9046-a','\\x00'::bytea);
`;

/** A campanha mínima; `saidas` entra como literal SQL (ou é omitida). */
function campanha(saidas?: string): string {
  const colunas = saidas === undefined ? "" : ",saidas";
  const valores = saidas === undefined ? "" : `,${saidas}`;
  return `insert into campaigns(id,organization_id,name,channel_session_id,base_legal${colunas})
  values ('${CAMP}','${ORG}','e9046','${SESSAO}','consent'${valores});`;
}

/**
 * Roda o script e devolve o SQLSTATE quando o Postgres recusa, ou a leitura
 * marcada com `r=` quando passa.
 *
 * ⚠️ A LEITURA ENTRA SEM PARÊNTESES: toda `leitura` traz `from … where …`, e
 * dentro de parênteses o parser do Postgres quer EXPRESSÃO, não cláusula `from`
 * (o erro que a primeira versão de `entrada-continua-contida-9039` cometeu e
 * documentou). Erro vem do STDERR do psql, lido em `e.stderr ?? e.message`,
 * mesmo padrão de `arquivo-de-webhook-so-manager-9035.test.ts`.
 */
function tenta(script: string, leitura?: string): string {
  try {
    const out = sql(`${seed}${script}
${leitura ? `select 'r=' || ${leitura};` : "select 'r=ok';"}
rollback;`);
    return (
      out
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("r="))
        ?.slice(2) ?? out
    );
  } catch (err) {
    const e = err as { stderr?: string | Buffer; message?: string };
    const texto = String(e.stderr ?? e.message ?? err);
    const m = /SQLSTATE[: ]+([0-9A-Z]{5})/.exec(texto) ?? /\((\d{5})\)/.exec(texto);
    if (m) return m[1]!;
    // O psql não imprime o SQLSTATE por padrão; o nome da constraint identifica
    // a recusa sem ambiguidade, e é o que precisamos afirmar.
    if (texto.includes("campaigns_saidas_validas")) return "23514";
    if (texto.includes("violates check constraint")) return "23514";
    return texto.slice(0, 200);
  }
}

describe("9046: as saídas da campanha moram no banco, e nascem no padrão", () => {
  it("a constraint existe, e é CHECK em campaigns", () => {
    expect(
      sql(`select count(*) from pg_constraint
            where conname = 'campaigns_saidas_validas'
              and conrelid = 'public.campaigns'::regclass
              and contype = 'c';`),
    ).toBe("1");
  });

  it("a coluna existe e é jsonb NULÁVEL — é a nulidade que preserva o comportamento", () => {
    // `not null default` daria o mesmo comportamento e apagaria a diferença
    // entre "configurada" e "herdou", que é a pergunta de quem audita por que
    // alguém parou de receber.
    expect(
      sql(`select data_type || '/' || is_nullable || '/' || coalesce(column_default,'sem-default')
             from information_schema.columns
            where table_schema = 'public' and table_name = 'campaigns' and column_name = 'saidas';`),
    ).toBe("jsonb/YES/sem-default");
  });

  it("campanha nasce com saidas NULA", () => {
    expect(
      tenta(campanha(), `coalesce(saidas::text,'nula') from campaigns where id = '${CAMP}'`),
    ).toBe("nula");
  });

  it("objeto passa e volta como foi gravado", () => {
    expect(
      tenta(
        campanha(`'{"ao_fechar": false, "etiquetas": ["x"]}'::jsonb`),
        `(saidas ->> 'ao_fechar') from campaigns where id = '${CAMP}'`,
      ),
    ).toBe("false");
  });

  it("ARRAY é recusado — é a confusão provável com a coluna vizinha `passos`", () => {
    expect(tenta(campanha(`'[]'::jsonb`))).toBe("23514");
    expect(tenta(campanha(`'[{"ao_fechar": true}]'::jsonb`))).toBe("23514");
  });

  it("string e número são recusados, apesar de serem jsonb válido", () => {
    expect(tenta(campanha(`'"nao"'::jsonb`))).toBe("23514");
    expect(tenta(campanha(`'42'::jsonb`))).toBe("23514");
    expect(tenta(campanha(`'null'::jsonb`))).toBe("23514");
  });

  it("OBJETO ILEGÍVEL é ACEITO — é a premissa de `duplicarAcao` copiar ilegível", () => {
    // ⚠️ CONTROLE POSITIVO DA PRÓPRIA DECISÃO DE DESENHO (P2.3 do
    // @Cassio_SecRev). `duplicarAcao` copia o objeto ilegível COMO ESTÁ, para a
    // cópia herdar a recusa em vez de virar o padrão por conta própria — e isso
    // só funciona se o banco aceitar gravá-lo. Sem este caso, quem endurecesse o
    // CHECK amanhã (trocando-o pela função `immutable` da 9034/9037, por
    // exemplo) faria `duplicarAcao` passar a levar 23514 na cópia, e a suíte
    // seguiria verde: nenhum outro caso aqui grava objeto malformado.
    //
    // A divisão de trabalho que isto fixa: o CHECK recusa a FORMA (array,
    // string, número), e o CONTEÚDO errado é assunto do Zod, que falha fechado.
    expect(
      tenta(
        campanha(`'{"ao_fechar": "sim"}'::jsonb`),
        `(saidas ->> 'ao_fechar') from campaigns where id = '${CAMP}'`,
      ),
    ).toBe("sim");
    expect(
      tenta(
        campanha(
          `'{"etiquetas": [], "etapas": [], "ao_fechar": true, "humano_assumir": true, "ao_responder": false}'::jsonb`,
        ),
        `(saidas ->> 'ao_responder') from campaigns where id = '${CAMP}'`,
      ),
    ).toBe("false");
  });

  it("voltar para NULO é aceito — é como se volta ao padrão pela tela", () => {
    expect(
      tenta(
        `${campanha(`'{"ao_fechar": false}'::jsonb`)}
update campaigns set saidas = null where id = '${CAMP}';`,
        `coalesce(saidas::text,'nula') from campaigns where id = '${CAMP}'`,
      ),
    ).toBe("nula");
  });
});
