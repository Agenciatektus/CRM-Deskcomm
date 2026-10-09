import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9040: A MEMÓRIA DE QUE O NEGÓCIO JÁ FOI FECHADO SOBREVIVE À REABERTURA.
 *
 * ## O que se prova, e por que em SQL
 *
 * A afirmação inteira é sobre comportamento de TRIGGER: `fn_crm_lead_close_on_stage`
 * grava `fechado_alguma_vez_em` ao fechar e não a limpa ao reabrir, enquanto
 * apaga `closed_at` e `lost_from_stage_id` no mesmo UPDATE. Nenhum teste de
 * unidade alcança isso — a lógica está no banco, e é exatamente essa limpeza que
 * abria o furo da 9039 (cliente ganho em março recebendo copy de primeiro contato
 * em outubro, depois de dois arrastos de triagem).
 *
 * O caso que importa é o 2: ele afirma, na mesma leitura, que as duas marcas
 * ANTIGAS foram apagadas e que a nova FICOU. Sem medir as duas coisas juntas, um
 * gatilho que simplesmente não limpasse mais nada passaria igual — e aí o #1537
 * (`lost_from_stage_id` não pertence a negócio reaberto) estaria quebrado em
 * silêncio.
 *
 * Tudo em transação desfeita (`rollback`). Zero PII.
 */

const id = (n: number) => `90400000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG = id(1);
const PIPE = id(2);
const ABERTA = id(3);
const GANHO = id(4);
const PERDA = id(5);
const LEAD = id(6);

const seed = `
begin;
insert into organizations(id,slug,display_name,legal_name)
  values ('${ORG}','f9040','F9040','F9040');
insert into crm_pipelines(id,organization_id,name,slug)
  values ('${PIPE}','${ORG}','F9040','f9040');
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position,is_won,is_lost) values
  ('${ABERTA}','${ORG}','${PIPE}','Novo','novo',1000,false,false),
  ('${GANHO}','${ORG}','${PIPE}','Ganho','ganho',2000,true,false),
  ('${PERDA}','${ORG}','${PIPE}','Perdido','perdido',3000,false,true);
insert into crm_leads(id,organization_id,pipeline_id,stage_id,title)
  values ('${LEAD}','${ORG}','${PIPE}','${ABERTA}','f9040 lead');
`;

/** Roda o script e devolve a leitura marcada com `r=`, ou o erro do psql. */
function leitura(script: string, expressao: string, qual: string = LEAD): string {
  try {
    const out = sql(`${seed}${script}
select 'r=' || ${expressao} from crm_leads where id = '${qual}';
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
    return String(e.stderr ?? e.message ?? err).slice(0, 200);
  }
}

const mover = (etapa: string, extra = "") =>
  `update crm_leads set stage_id = '${etapa}'${extra} where id = '${LEAD}';`;

describe("9040: a coluna existe e o gatilho a preenche", () => {
  it("a coluna existe em crm_leads", () => {
    // O controle da própria suíte: sem ele, os casos abaixo falhariam por erro de
    // coluna inexistente em vez de por comportamento, e "vermelho" não diria o quê.
    expect(
      sql(`select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'crm_leads'
              and column_name = 'fechado_alguma_vez_em';`),
    ).toBe("1");
  });

  it("GANHAR marca a coluna", () => {
    expect(leitura(mover(GANHO), "(fechado_alguma_vez_em is not null)::text")).toBe("true");
  });

  it("PERDER marca a coluna", () => {
    expect(
      leitura(
        mover(PERDA, ", lost_reason = 'price'"),
        "(fechado_alguma_vez_em is not null)::text",
      ),
    ).toBe("true");
  });

  it("negócio que nunca fechou NÃO tem a marca", () => {
    // O controle positivo: um gatilho que marcasse em toda transição passaria
    // nos dois casos de cima e seria inútil para o veto.
    expect(leitura("", "coalesce(fechado_alguma_vez_em::text,'nulo')")).toBe("nulo");
  });

  it("INSERT direto numa etapa ABERTA não marca", () => {
    // Lê o negócio NOVO, e não o do seed: sem o terceiro argumento este caso
    // mediria o lead errado e passaria à toa.
    const novo = id(7);
    expect(
      leitura(
        `insert into crm_leads(id,organization_id,pipeline_id,stage_id,title)
           values ('${novo}','${ORG}','${PIPE}','${ABERTA}','f9040 outro');`,
        "coalesce(fechado_alguma_vez_em::text,'nulo')",
        novo,
      ),
    ).toBe("nulo");
  });

  it("INSERT direto numa etapa de GANHO marca", () => {
    // O gatilho é `before insert or update of stage_id`, então o INSERT também
    // passa por ele — e sem este caso o par de cima não distinguiria "não marca
    // em etapa aberta" de "não marca em INSERT nenhum".
    const ganho = id(9);
    expect(
      leitura(
        `insert into crm_leads(id,organization_id,pipeline_id,stage_id,title)
           values ('${ganho}','${ORG}','${PIPE}','${GANHO}','f9040 ganho direto');`,
        "status || '|' || (fechado_alguma_vez_em is not null)::text",
        ganho,
      ),
    ).toBe("won|true");
  });
});

describe("9040: REABRIR apaga as marcas antigas e não a nova", () => {
  it("ganhar e reabrir: closed_at some, lost_from_stage_id some, a marca FICA", () => {
    // É o caso que justifica a migration, e ele mede as TRÊS coisas na mesma
    // leitura de propósito: um gatilho que parasse de limpar qualquer coisa
    // passaria se medíssemos só a marca nova — e quebraria o #1537 sem ninguém
    // ver.
    expect(
      leitura(
        `${mover(GANHO)}\n${mover(ABERTA)}`,
        `status || '|' || coalesce(closed_at::text,'nulo') || '|' ` +
          `|| coalesce(lost_from_stage_id::text,'nulo') || '|' ` +
          `|| (fechado_alguma_vez_em is not null)::text`,
      ),
    ).toBe("open|nulo|nulo|true");
  });

  it("perder e reabrir: a marca FICA, e `lost_reason` sobrevive", () => {
    // `lost_reason` é o segundo sinal que a aplicação usa, e ele cobre a perda
    // HISTÓRICA que o backfill não alcança. Se algum dia alguém o limpar na
    // reabertura, este caso reprova e o veto perde metade da cobertura.
    expect(
      leitura(
        `${mover(PERDA, ", lost_reason = 'price'")}\n${mover(ABERTA)}`,
        `status || '|' || coalesce(lost_reason,'nulo') || '|' ` +
          `|| (fechado_alguma_vez_em is not null)::text`,
      ),
    ).toBe("open|price|true");
  });

  it("fechar, reabrir e fechar de novo NÃO reescreve a data", () => {
    // `coalesce` guarda o PRIMEIRO fechamento. Reescrever faria a coluna
    // responder "quando fechou a última vez", que é informação de `closed_at`.
    expect(
      leitura(
        `${mover(GANHO)}
update crm_leads set fechado_alguma_vez_em = '2020-01-01T00:00:00Z' where id = '${LEAD}';
${mover(ABERTA)}
${mover(GANHO)}`,
        "to_char(fechado_alguma_vez_em at time zone 'UTC','YYYY-MM-DD')",
      ),
    ).toBe("2020-01-01");
  });

  it("arrastar entre DUAS etapas abertas não marca nada", () => {
    // Movimento comum do quadro não pode ganhar a marca por acidente: ela veta
    // abordagem, e marcar à toa tiraria prospect legítimo de toda campanha
    // contínua.
    const outraAberta = id(8);
    expect(
      leitura(
        `insert into crm_stages(id,organization_id,pipeline_id,name,slug,position,is_won,is_lost)
           values ('${outraAberta}','${ORG}','${PIPE}','Contato','contato',1500,false,false);
${mover(outraAberta)}`,
        "coalesce(fechado_alguma_vez_em::text,'nulo')",
      ),
    ).toBe("nulo");
  });
});

/**
 * OS TRÊS SINAIS DE "JÁ FOI FECHADO", EM SQL.
 *
 * `lib/campanhas/entrada-por-etapa.db.ts` compõe um OU de três colunas, e o teste
 * de unidade prova a composição em TypeScript. O que ele não alcança é que as
 * três colunas EXISTAM e signifiquem o que a aplicação presume, e é isso que se
 * mede aqui — em particular o terceiro, `retomado_de_lead_id`, que vem da 0425 e
 * é o único sinal do funil `novo_negocio`, onde nada reabre: nasce um card NOVO
 * apontando para o encerrado, sem herdar `lost_reason` nem a coluna da 9040
 * (`CAMPOS_COPIAVEIS_NA_RETOMADA` não os copia).
 *
 * O predicado é escrito na mesma forma que o adapter monta, para a prova ser da
 * regra e não de uma reimplementação dela.
 */
describe("9040: os três sinais que o veto da campanha contínua lê", () => {
  const CLONE = id(10);
  const vetado = (qual: string) => `coalesce((
    select (l.fechado_alguma_vez_em is not null)
        or (l.lost_reason is not null and length(l.lost_reason) > 0)
        or (l.retomado_de_lead_id is not null)
      from crm_leads l where l.id = '${qual}'
  ), false)::text`;

  it("CLONE de negócio encerrado (funil `novo_negocio`) é vetado, sem marca nenhuma", () => {
    // O cenário inteiro: cliente ganho em março, funil em `novo_negocio`; em
    // outubro o operador clica Retomar e nasce ESTE card, aberto, numa etapa
    // aberta, sem `fechado_alguma_vez_em` e sem `lost_reason`. Antes do terceiro
    // sinal ele passava por todos os vetos e recebia a copy de primeiro contato —
    // e não como lacuna histórica: para sempre, em todo funil nesse modo.
    expect(
      leitura(
        `${mover(GANHO)}
insert into crm_leads(id,organization_id,pipeline_id,stage_id,title,source,retomado_de_lead_id)
  values ('${CLONE}','${ORG}','${PIPE}','${ABERTA}','f9040 clone','retomada','${LEAD}');`,
        `status || '|' || coalesce(fechado_alguma_vez_em::text,'nulo') || '|' ` +
          `|| coalesce(lost_reason,'nulo') || '|' || ${vetado(CLONE)}`,
        CLONE,
      ),
    ).toBe(`open|nulo|nulo|true`);
  });

  it("CONTROLE: card novo SEM origem encerrada não é vetado", () => {
    // Sem ele, o caso de cima não distinguiria "o sinal funciona" de "o predicado
    // veta todo mundo". `clonar-para-funil.ts` só grava `retomado_de_lead_id` quando a
    // origem NÃO estava aberta, então card comum nasce com ele nulo.
    expect(
      leitura(
        `insert into crm_leads(id,organization_id,pipeline_id,stage_id,title)
           values ('${id(11)}','${ORG}','${PIPE}','${ABERTA}','f9040 comum');`,
        vetado(id(11)),
        id(11),
      ),
    ).toBe("false");
  });

  it("o negócio ganho e REABERTO no mesmo registro também é vetado", () => {
    // O outro modo (`mesmo_registro`, o default), pelo primeiro sinal. Os dois
    // casos juntos cobrem os dois modos de reabertura do produto.
    expect(leitura(`${mover(GANHO)}
${mover(ABERTA)}`, vetado(LEAD))).toBe("true");
  });

  it("a FK da 0425 existe — o terceiro sinal não é coluna solta", () => {
    expect(
      sql(`select count(*) from pg_constraint
            where conname = 'fk_crm_leads_retomado_de_lead'
              and conrelid = 'public.crm_leads'::regclass;`),
    ).toBe("1");
  });
});
