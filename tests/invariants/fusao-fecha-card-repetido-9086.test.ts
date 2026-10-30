import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9086: na fusão de contatos, o card aberto do absorvido que repetiria
 * um card aberto do principal no mesmo funil é fechado (lost) antes do
 * repontamento, em vez de ficar pendurado na lápide (índice 9082).
 *
 * Prova: o repontamento de crm_leads.contact_id, que sem o gatilho bate 23505,
 * passa; o card do absorvido vira lost com motivo; o do principal segue aberto.
 * Controles: funil diferente e origem manual NÃO são fechados.
 */

const raiz = join(__dirname, "..", "..");
const migration = readdirSync(join(raiz, "supabase", "migrations")).find((f) => /^\d{14}_9086_/.test(f));
const baseline = readFileSync(join(raiz, "supabase", "baseline.sql"), "utf8");

const id = (n: number) => `90860000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1);
const VENDAS = id(21);
const POS = id(22);
const S_V = id(31);
const S_P = id(32);
const S_PERDA = id(33);
const PRINCIPAL = id(41);
const ABSORVIDO = id(42);

const seed = `
begin;
insert into organizations(id,slug,display_name,legal_name) values ('${ORG}','d9086','D9086','D9086');
insert into contacts(id,organization_id,display_name) values ('${PRINCIPAL}','${ORG}','D9086 principal'),('${ABSORVIDO}','${ORG}','D9086 absorvido');
insert into crm_pipelines(id,organization_id,name,slug) values
 ('${VENDAS}','${ORG}','D9086 Vendas','d9086-vendas'),('${POS}','${ORG}','D9086 Pos','d9086-pos');
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position) values
 ('${S_V}','${ORG}','${VENDAS}','Novo','novo',1),('${S_P}','${ORG}','${POS}','Novo','novo',1);
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position,is_lost) values
 ('${S_PERDA}','${ORG}','${VENDAS}','Perdido','perdido',9,true);
`;

const lead = (n: number, contato: string, source: string, funil = VENDAS, etapa = S_V) =>
  `insert into crm_leads(id,organization_id,pipeline_id,stage_id,contact_id,title,source) values ('${id(100 + n)}','${ORG}','${funil}','${etapa}','${contato}','D9086 ${n}','${source}');`;

const funde = `
update contacts set is_merged_into = '${PRINCIPAL}' where id = '${ABSORVIDO}';
update crm_leads set contact_id = '${PRINCIPAL}' where contact_id = '${ABSORVIDO}';`;

function prova(corpo: string, consulta: string): string {
  try {
    return sql(`${seed}\n${corpo}\n${consulta}\nrollback;`);
  } catch (erro) {
    const e = erro as Error & { stderr?: string | Buffer; stdout?: string | Buffer };
    throw new Error([e.message, String(e.stderr ?? ""), String(e.stdout ?? "")].join("\n"));
  }
}

const statusDe = (n: number) => `select status from crm_leads where id = '${id(100 + n)}';`;

describe("9086: texto", () => {
  it("migration e baseline trazem o gatilho", () => {
    expect(migration).toBeTruthy();
    const texto = readFileSync(join(raiz, "supabase", "migrations", migration!), "utf8");
    expect(texto).toMatch(/^-- manifest: 9086/);
    expect(texto).toContain("trg_contacts_fusao_fecha_card_repetido");
    expect(baseline).toContain("(migration 9086) ----");
    expect(baseline).toContain("create trigger trg_contacts_fusao_fecha_card_repetido");
  });
});

describe("9086: no banco", () => {
  it("absorvido e principal com card aberto no mesmo funil: o do absorvido é fechado e o repontamento passa", () => {
    const saida = prova(
      `${lead(1, PRINCIPAL, "whatsapp")}\n${lead(2, ABSORVIDO, "importacao_planilha")}${funde}`,
      `${statusDe(1)}\n${statusDe(2)}\nselect lost_reason from crm_leads where id = '${id(102)}';`,
    );
    expect(saida).toMatch(/open\s+lost\s+moved_to_another_pipeline/);
  });

  it("funil diferente: os dois seguem abertos (controle)", () => {
    const saida = prova(
      `${lead(1, PRINCIPAL, "whatsapp")}\n${lead(2, ABSORVIDO, "whatsapp", POS, S_P)}${funde}`,
      `select count(*) from crm_leads where status = 'open' and contact_id = '${PRINCIPAL}';`,
    );
    expect(saida).toMatch(/\b2\b/);
  });

  it("origem manual não é fechada (controle)", () => {
    const saida = prova(
      `${lead(1, PRINCIPAL, "whatsapp")}\n${lead(2, ABSORVIDO, "manual")}${funde}`,
      statusDe(2),
    );
    expect(saida).toMatch(/open/);
  });
});
