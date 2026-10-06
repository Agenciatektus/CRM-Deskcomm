import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9038: A CONTENÇÃO DA ENTRADA CONTÍNUA EXISTE NO BANCO.
 *
 * ## Por que este invariante é obrigatório, e não zelo
 *
 * `campaigns_entrada_continua_contida` é, pelo texto da própria migration, "a
 * contenção do recurso": no modo contínuo não há lista para o operador conferir
 * antes de apertar, então o teto do dia é a ÚNICA coisa que limita quantos
 * estranhos recebem mensagem por dia e a janela é a única que impede que recebam
 * de madrugada.
 *
 * O parecer do @Cassio_SecRev na fatia 3 (P1-1) mostrou que ela é defesa ÚNICA:
 * `lib/campanhas/entrada-por-etapa.ts` passou a recusar alistar quando o teto é
 * nulo, mas se este CHECK não existir — baseline não reaplicado numa VPS de
 * cliente, constraint derrubada num conserto manual — a campanha chega a
 * `running` com teto em branco e o produto depende só daquele `if`. Contenção
 * não testada é contenção presumida.
 *
 * ## O que se prova aqui, e por que cada caso
 *
 *  1. `running` com teto nulo → 23514. É o cenário de produção.
 *  2. `running` com janela pela metade → 23514, nas duas metades.
 *  3. `draft` com tudo nulo PASSA. A exceção é deliberada (mesma forma de
 *     `followup_flow_pointers_cadencia_completa`, que excetua o pointer não
 *     `active`): sem ela, marcar o modo antes de digitar o teto daria 23514 no
 *     SALVAR e prenderia o operador num rascunho impossível de corrigir.
 *  4. `draft → running` com teto nulo → 23514. É esta transição que cobra a
 *     contenção, e é a que torna a exceção de rascunho segura.
 *  5. APAGAR a etapa de entrada anula `entrada_etapa_id` SEM FALHAR. É a
 *     regressão que a 9032 consertou (FK `set null` sem lista de colunas zerava
 *     `organization_id`, que é NOT NULL, e o DELETE morria com 23502) e que um
 *     CHECK exigindo `entrada_etapa_id is not null` reintroduziria por outro
 *     caminho, agora com 23514. É por isso que funil e etapa ficam fora do CHECK.
 *  6. Duas linhas `skipped` com `recipient_address` NULO coexistem na mesma
 *     campanha. `campaign_recipients_endereco_unico` é unique simples e no
 *     Postgres NULL é distinto de NULL, mas a entrada contínua grava uma linha
 *     excluída por contato vetado que cruza a etapa — se essa premissa fosse
 *     falsa, o segundo bloqueado bateria em 23505 e o gatilho pararia de
 *     registrar o motivo da exclusão.
 *
 * Tudo em transação desfeita (`rollback`), como as irmãs. Zero PII.
 */

const id = (n: number) => `90380000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG = id(1);
const SESSAO = id(2);
const PIPE = id(3);
const ETAPA = id(4);
const CONTATO_A = id(5);
const CONTATO_B = id(6);
const CAMP = id(7);

const seed = `
begin;
insert into organizations(id,slug,display_name,legal_name)
  values ('${ORG}','e9038','E9038','E9038');
insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted)
  values ('${SESSAO}','${ORG}','e9038-a','\\x00'::bytea);
insert into crm_pipelines(id,organization_id,name,slug)
  values ('${PIPE}','${ORG}','E9038','e9038');
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position)
  values ('${ETAPA}','${ORG}','${PIPE}','Novo','novo',1000);
insert into contacts(id,organization_id,display_name)
  values ('${CONTATO_A}','${ORG}','E9038 Um'),('${CONTATO_B}','${ORG}','E9038 Dois');
`;

/** As colunas comuns de uma campanha contínua; o chamador completa o resto. */
function campanha(extras: string): string {
  return `insert into campaigns(id,organization_id,name,channel_session_id,base_legal,pipeline_id,entrada_continua,entrada_etapa_id,${extras.split("=>")[0]})
  values ('${CAMP}','${ORG}','e9038','${SESSAO}','consent','${PIPE}',true,'${ETAPA}',${extras.split("=>")[1]});`;
}

/**
 * Roda o script e devolve o SQLSTATE quando o Postgres recusa, ou a leitura
 * marcada com `r=` quando passa.
 *
 * Erro vem do stderr do psql, que o `execFileSync` joga na exceção: o padrão de
 * `organizacao-nao-muda-9030.test.ts`.
 */
function tenta(script: string, leitura?: string): string {
  try {
    const out = sql(`${seed}${script}
${leitura ? `select 'r=' || (${leitura});` : "select 'r=ok';"}
rollback;`);
    return out
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("r="))
      ?.slice(2) ?? out;
  } catch (err) {
    const texto = err instanceof Error ? `${err.message}` : String(err);
    const m = /SQLSTATE[: ]+([0-9A-Z]{5})/.exec(texto) ?? /\((\d{5})\)/.exec(texto);
    if (m) return m[1]!;
    // O psql não imprime o SQLSTATE por padrão; o nome da constraint identifica
    // a recusa sem ambiguidade, e é o que precisamos afirmar.
    if (texto.includes("campaigns_entrada_continua_contida")) return "23514";
    if (texto.includes("violates check constraint")) return "23514";
    if (texto.includes("violates unique constraint")) return "23505";
    if (texto.includes("violates not-null")) return "23502";
    return texto.slice(0, 200);
  }
}

describe("9038: a contenção do modo contínuo é cobrada pelo banco", () => {
  it("a constraint existe, e é CHECK em campaigns", () => {
    // Sem este caso, todos os outros passariam num banco SEM a constraint pelo
    // motivo errado (o INSERT simplesmente não falharia, e "não falhou" é o que
    // alguns deles afirmam). É o controle da própria suíte.
    expect(
      sql(`select count(*) from pg_constraint
            where conname = 'campaigns_entrada_continua_contida'
              and conrelid = 'public.campaigns'::regclass
              and contype = 'c';`),
    ).toBe("1");
  });

  it("running com teto do dia NULO é recusado", () => {
    expect(
      tenta(
        campanha(
          "status,janela_inicio_hora,janela_fim_hora,teto_diario=>'running',9,18,null",
        ),
      ),
    ).toBe("23514");
  });

  it("running sem a hora de INÍCIO da janela é recusado", () => {
    expect(
      tenta(
        campanha(
          "status,janela_inicio_hora,janela_fim_hora,teto_diario=>'running',null,18,50",
        ),
      ),
    ).toBe("23514");
  });

  it("running sem a hora de FIM da janela é recusado", () => {
    expect(
      tenta(
        campanha(
          "status,janela_inicio_hora,janela_fim_hora,teto_diario=>'running',9,null,50",
        ),
      ),
    ).toBe("23514");
  });

  it("running com teto e janela completos passa", () => {
    // O controle positivo: sem ele, os três casos acima passariam também num
    // CHECK escrito errado que recusasse tudo.
    expect(
      tenta(
        campanha("status,janela_inicio_hora,janela_fim_hora,teto_diario=>'running',9,18,50"),
        `teto_diario::text from campaigns where id = '${CAMP}'`,
      ),
    ).toBe("50");
  });

  it("RASCUNHO com teto e janela em branco PASSA — a exceção é deliberada", () => {
    // Sem ela, marcar o modo contínuo antes de digitar o teto daria 23514 no
    // SALVAR, e o operador ficaria preso num rascunho que não dá para corrigir
    // sem apagar. Mesma forma de `followup_flow_pointers_cadencia_completa`.
    expect(
      tenta(
        campanha(
          "status,janela_inicio_hora,janela_fim_hora,teto_diario=>'draft',null,null,null",
        ),
        `status from campaigns where id = '${CAMP}'`,
      ),
    ).toBe("draft");
  });

  it("SAIR do rascunho com teto nulo é recusado — é a transição que cobra", () => {
    // É este caso que torna a exceção de rascunho segura: a contenção não é
    // dispensada, é cobrada mais tarde. `draft → preparing` é um UPDATE comum, e
    // é nele que o CHECK morde.
    expect(
      tenta(
        `${campanha("status,janela_inicio_hora,janela_fim_hora,teto_diario=>'draft',null,null,null")}
update campaigns set status = 'preparing' where id = '${CAMP}';`,
      ),
    ).toBe("23514");
  });

  it("campanha em modo LISTA com tudo em branco passa em qualquer estado", () => {
    // O limite que a fatia não podia violar: campanha existente não muda de
    // comportamento. `entrada_continua = false` torna o CHECK vacuamente
    // verdadeiro, e é o default de toda linha anterior à 9038.
    expect(
      tenta(
        `insert into campaigns(id,organization_id,name,channel_session_id,base_legal,status,teto_diario,janela_inicio_hora,janela_fim_hora)
  values ('${CAMP}','${ORG}','e9038-lista','${SESSAO}','consent','running',null,null,null);`,
        `(entrada_continua)::text from campaigns where id = '${CAMP}'`,
      ),
    ).toBe("false");
  });
});

describe("9038: apagar a etapa de entrada não derruba a campanha", () => {
  it("DELETE da etapa anula entrada_etapa_id e mantém a organização", () => {
    // A regressão que a 9032 consertou (FK `set null` sem lista de colunas
    // zerava `organization_id`, NOT NULL, e o DELETE morria com 23502) e que um
    // CHECK exigindo `entrada_etapa_id is not null` reintroduziria com 23514. É
    // por isso que funil e etapa ficam FORA do CHECK: quem os exige é o gate de
    // `lib/campanhas/acoes.ts`, e a falha é fechada (o gatilho não casa etapa
    // nula, então a campanha para de abordar em vez de abordar errado).
    expect(
      tenta(
        `${campanha("status,janela_inicio_hora,janela_fim_hora,teto_diario=>'running',9,18,50")}
delete from crm_stages where id = '${ETAPA}';`,
        `coalesce(entrada_etapa_id::text,'nulo') || '|' || organization_id from campaigns where id = '${CAMP}'`,
      ),
    ).toBe(`nulo|${ORG}`);
  });

  it("a FK nova tem a lista de colunas do `set null`", () => {
    expect(
      sql(`select cardinality(confdelsetcols)::text from pg_constraint
            where conname = 'campaigns_entrada_etapa_org_fk'
              and conrelid = 'public.campaigns'::regclass;`),
    ).toBe("1");
  });

  it("o índice parcial do gatilho existe", () => {
    // Toda mudança de etapa do CRM pergunta "alguma campanha contínua está
    // armada nesta etapa?". Sem o índice isso é varredura de `campaigns` a cada
    // card arrastado, no caminho quente do quadro.
    expect(
      sql(`select count(*) from pg_indexes
            where schemaname = 'public' and indexname = 'campaigns_entrada_por_etapa';`),
    ).toBe("1");
  });
});

describe("9038: linha de exclusão sem telefone não disputa unicidade", () => {
  it("duas linhas skipped com recipient_address NULO coexistem", () => {
    // A entrada contínua grava uma linha EXCLUÍDA por contato que cruza a etapa
    // e é vetado — e ela nasce sem telefone de propósito (PII sem finalidade não
    // se guarda). `campaign_recipients_endereco_unico` é unique simples e no
    // Postgres NULL é distinto de NULL, então elas convivem; se não
    // convivessem, o SEGUNDO bloqueado bateria em 23505 e o gatilho pararia de
    // registrar o motivo da exclusão — em silêncio, porque 23505 é caminho
    // normal ali.
    expect(
      tenta(
        `${campanha("status,janela_inicio_hora,janela_fim_hora,teto_diario=>'running',9,18,50")}
insert into campaign_recipients(organization_id,campaign_id,contact_id,recipient_address,status,eligibility_status,exclusion_reason)
  values ('${ORG}','${CAMP}','${CONTATO_A}',null,'skipped','excluded','opt_out'),
         ('${ORG}','${CAMP}','${CONTATO_B}',null,'skipped','excluded','sem_telefone');`,
        `count(*)::text from campaign_recipients where campaign_id = '${CAMP}'`,
      ),
    ).toBe("2");
  });

  it("CONTROLE: o MESMO contato duas vezes na mesma campanha é recusado", () => {
    // É este unique que a fatia usa como anti-repetição do card que entra e sai
    // da etapa. Sem este caso, o anterior não distinguiria "NULL não disputa" de
    // "a constraint não existe".
    expect(
      tenta(
        `${campanha("status,janela_inicio_hora,janela_fim_hora,teto_diario=>'running',9,18,50")}
insert into campaign_recipients(organization_id,campaign_id,contact_id,status,eligibility_status)
  values ('${ORG}','${CAMP}','${CONTATO_A}','skipped','excluded'),
         ('${ORG}','${CAMP}','${CONTATO_A}','pending','eligible');`,
      ),
    ).toBe("23505");
  });
});
