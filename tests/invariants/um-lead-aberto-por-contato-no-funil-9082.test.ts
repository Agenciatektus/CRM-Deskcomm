import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ORIGENS_FORA_DO_LEAD_UNICO } from "@/lib/leads/negocio-aberto-duplicado";

import { sql } from "./gov-helpers";

/**
 * Migration 9082: um contato tem no máximo UM negócio aberto por funil quando
 * a origem é automática ou lote (defeito do Salão Fabiana Lopes, 28/10/2026).
 *
 * O que se prova:
 *  - o texto: migration e baseline trazem o MESMO predicado, e a lista de
 *    origens fora dele é a de `ORIGENS_FORA_DO_LEAD_UNICO`;
 *  - no banco: whatsapp + importacao_planilha no mesmo contato/funil é 23505;
 *  - whatsapp + manual NÃO é barrado (par legítimo em produção);
 *  - nuvemshop x2 não é barrado (um card por pedido);
 *  - aberto + perdido, e aberto em outro funil, passam.
 *
 * Zero PII: nomes sintéticos.
 */

const INDICE = "crm_leads_um_aberto_por_contato_no_funil";
const PREDICADO = "where status = 'open' and contact_id is not null and source not in ('manual', 'nuvemshop')";

const raiz = join(__dirname, "..", "..");
const migration = readdirSync(join(raiz, "supabase", "migrations")).find((f) => /^\d{14}_9082_/.test(f));
const textoDaMigration = migration ? readFileSync(join(raiz, "supabase", "migrations", migration), "utf8") : "";
const baseline = readFileSync(join(raiz, "supabase", "baseline.sql"), "utf8");

const id = (n: number) => `90820000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1);
const VENDAS = id(21);
const POS = id(22);
const S_V = id(31);
const S_P = id(32);
const CONTATO = id(41);

const seed = `
begin;
insert into organizations(id,slug,display_name,legal_name) values ('${ORG}','d9082','D9082','D9082');
insert into contacts(id,organization_id,display_name) values ('${CONTATO}','${ORG}','D9082 contato');
insert into crm_pipelines(id,organization_id,name,slug) values
 ('${VENDAS}','${ORG}','D9082 Vendas','d9082-vendas'),('${POS}','${ORG}','D9082 Pos','d9082-pos');
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position) values
 ('${S_V}','${ORG}','${VENDAS}','Novo','novo',1),('${S_P}','${ORG}','${POS}','Novo','novo',1);
`;

const lead = (n: number, source: string, funil = VENDAS, etapa = S_V) =>
  `insert into crm_leads(id,organization_id,pipeline_id,stage_id,contact_id,title,source) values ('${id(100 + n)}','${ORG}','${funil}','${etapa}','${CONTATO}','D9082 ${n}','${source}');`;

function prova(corpo: string): string {
  try {
    return sql(`${seed}\n${corpo}\nrollback;\nselect 'provado';`);
  } catch (erro) {
    const e = erro as Error & { stderr?: string | Buffer; stdout?: string | Buffer };
    throw new Error([e.message, String(e.stderr ?? ""), String(e.stdout ?? "")].join("\n"));
  }
}

describe("9082: texto da migration e do baseline", () => {
  it("a migration existe e cria o índice com o predicado", () => {
    expect(migration).toBeTruthy();
    expect(textoDaMigration).toMatch(/^-- manifest: 9082/);
    expect(textoDaMigration).toContain(`create unique index crm_leads_um_aberto_por_contato_no_funil`);
    expect(textoDaMigration).toContain("on public.crm_leads (organization_id, contact_id, pipeline_id)");
    expect(textoDaMigration).toContain(PREDICADO);
    expect(textoDaMigration).toMatch(/create unique index concurrently if not exists crm_leads_um_aberto_por_contato_no_funil/);
  });

  it("o baseline traz o mesmo bloco, com o mesmo predicado", () => {
    const bloco = baseline.slice(baseline.indexOf("(migration 9082) ----"));
    expect(bloco.length).toBeGreaterThan(30);
    expect(bloco).toContain(`create unique index ${INDICE}`);
    expect(bloco).toContain(PREDICADO);
  });

  it("a lista do TypeScript é a do predicado", () => {
    const lista = ORIGENS_FORA_DO_LEAD_UNICO.map((s) => `'${s}'`).join(", ");
    expect(PREDICADO).toContain(`source not in (${lista})`);
  });
});

describe("9082: no banco", () => {
  it("o índice existe, único e parcial", () => {
    expect(
      sql(`select i.indisunique, pg_get_expr(i.indpred, i.indrelid) is not null
             from pg_index i where i.indexrelid = 'public.${INDICE}'::regclass;`),
    ).toBe("t|t");
  });

  it("whatsapp + importacao_planilha no mesmo contato e funil: 23505 do índice", () => {
    expect(() => prova(`${lead(1, "whatsapp")}\n${lead(2, "importacao_planilha")}`)).toThrow(new RegExp(INDICE));
  });

  it("whatsapp + manual NÃO é barrado (par legítimo)", () => {
    expect(prova(`${lead(1, "whatsapp")}\n${lead(2, "manual")}\n${lead(3, "manual")}`)).toContain("provado");
  });

  it("nuvemshop x2 não é barrado (um card por pedido)", () => {
    expect(prova(`${lead(1, "nuvemshop")}\n${lead(2, "nuvemshop")}`)).toContain("provado");
  });

  it("outro funil e negócio encerrado não contam", () => {
    expect(
      prova(`${lead(1, "whatsapp")}
${lead(2, "whatsapp", POS, S_P)}
update crm_leads set status = 'lost', lost_reason = 'other', closed_at = now() where id = '${id(101)}';
${lead(3, "importacao_planilha")}`),
    ).toContain("provado");
  });
});
