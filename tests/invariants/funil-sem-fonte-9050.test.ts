import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9050: funil pode ficar SEM fonte (pós-venda, recompra).
 *
 *   1. `fontes = '{}'` é aceito pelo CHECK `crm_pipelines_fontes_conhecidas`.
 *   2. Fonte fora do vocabulário fechado continua recusada.
 *   3. Reaplicar o bloco da 9050 do baseline numa base com o CHECK ANTIGO
 *      (`cardinality > 0`, o de produção) deixa o novo. O teste EXECUTA o SQL
 *      do baseline, não procura texto nele. Controle negativo: com o CHECK
 *      antigo, `'{}'` é recusado (prova que o passo 1 mede alguma coisa).
 *
 * Tudo em transação com rollback. Zero PII.
 */

const id = (n: number) => `90500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1);
const PIPE = id(2);

const seed = `
begin;
insert into organizations(id,slug,display_name,legal_name) values ('${ORG}','f9050','F9050','F9050');
`;

const funil = (fontes: string) =>
  `insert into crm_pipelines(id,organization_id,name,slug,fontes) values ('${PIPE}','${ORG}','Pós-venda','f9050-pos','${fontes}'::text[]);`;

const CHECK_ANTIGO = `
alter table public.crm_pipelines
  drop constraint crm_pipelines_fontes_conhecidas,
  add constraint crm_pipelines_fontes_conhecidas
    check (cardinality(fontes) > 0 and fontes <@ array['whatsapp','instagram_direct','instagram_comentario']::text[]);
`;

const DEF = `select pg_get_constraintdef(oid) from pg_constraint
  where conname = 'crm_pipelines_fontes_conhecidas' and conrelid = 'public.crm_pipelines'::regclass;`;

function bloco9050(): string {
  const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
  const inicio = baseline.indexOf("-- ---- funil sem fonte: o CHECK aceita");
  const fim = baseline.indexOf("-- ---- VARREDURA anon:", inicio);
  if (inicio < 0 || fim < 0)
    throw new Error("bloco da 9050 não encontrado em supabase/baseline.sql");
  return baseline.slice(inicio, fim);
}

const prova = (corpo: string) => sql(`${seed}\n${corpo}\nrollback;\nselect 'provado';`);

describe("9050: funil sem fonte", () => {
  it("funil com fontes '{}' é aceito", () => {
    expect(prova(funil("{}"))).toContain("provado");
  });

  it("fonte fora do vocabulário continua recusada", () => {
    expect(() => prova(funil("{telegram}"))).toThrow(/crm_pipelines_fontes_conhecidas/);
    expect(() => prova(funil("{whatsapp,WhatsApp}"))).toThrow(/crm_pipelines_fontes_conhecidas/);
  });

  it("controle negativo: com o CHECK antigo, '{}' é recusado", () => {
    expect(() => prova(`${CHECK_ANTIGO}\n${funil("{}")}`)).toThrow(
      /crm_pipelines_fontes_conhecidas/,
    );
  });

  it("reaplicar o baseline sobre o CHECK antigo deixa o novo", () => {
    const out = sql(`${seed}\n${CHECK_ANTIGO}\n${bloco9050()}\n${DEF}\n${funil("{}")}\nrollback;`);
    const def = out.split("\n").find((l) => l.startsWith("CHECK"));
    expect(def).toBeDefined();
    expect(def).not.toMatch(/cardinality/);
    expect(def).toMatch(/instagram_comentario/);
  });
});
