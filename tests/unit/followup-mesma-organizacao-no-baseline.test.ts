import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A CONFERÊNCIA DE ORGANIZAÇÃO DA 9024 ESTÁ NO QUE O CLIENTE APLICA.
 *
 * A prova comportamental é `tests/invariants/followup-mesma-organizacao.test.ts`
 * (Postgres real, JWT de manager da org A contra o fluxo da org B). Ela precisa
 * de Docker; esta cerca roda em qualquer máquina e garante a outra metade: o
 * `baseline.sql` — o que `install.sh`/`update.sh` aplicam — define a função
 * `security definer` com `search_path` fixo, ela compara a org do PONTEIRO e da
 * VERSÃO com a da linha, e as duas triggers existem nas duas tabelas, cobrindo
 * INSERT e o UPDATE das colunas que ligam as linhas. Sem qualquer uma dessas
 * peças, a inscrição da org A volta a poder apontar para o fluxo da org B
 * (P1 do @Cassio_SecRev na #56).
 */
const BASELINE = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");

function ultimaDefinicao(sql: string): string {
  const i = sql.lastIndexOf("create or replace function public.fn_followup_mesma_organizacao()");
  if (i === -1) return "";
  const fim = sql.indexOf("$fmo$;", i);
  return fim === -1 ? "" : sql.slice(i, fim);
}

function trigger(sql: string, tabela: string): string {
  const m = new RegExp(
    `create trigger trg_followup_mesma_organizacao\\s+before insert or update of ([a-z_, ]+) on public\\.${tabela}\\s+for each row execute function public\\.fn_followup_mesma_organizacao\\(\\);`,
  ).exec(sql);
  return m?.[1] ?? "";
}

function conferir(sql: string): string[] {
  const falhas: string[] = [];
  const def = ultimaDefinicao(sql);
  if (!def) return ["fn_followup_mesma_organizacao não está no baseline"];
  if (!/security definer set search_path = public, pg_temp/.test(def)) falhas.push("não é security definer com search_path fixo");
  if (!/p\.id = new\.pointer_id and p\.organization_id = new\.organization_id/.test(def)) falhas.push("não confere a org do ponteiro");
  if (!/v\.id = new\.version_id and v\.organization_id = new\.organization_id/.test(def)) falhas.push("não confere a org da versão");
  if (!/errcode = '42501'/.test(def)) falhas.push("não recusa com 42501");
  const varredura = sql.search(/^-- ---- VARREDURA anon:/m);
  if (sql.lastIndexOf("create or replace function public.fn_followup_mesma_organizacao()") > varredura)
    falhas.push("a função nasce depois da varredura de anon");
  if (!/revoke all on function public\.fn_followup_mesma_organizacao\(\) from public, anon, authenticated;/.test(sql))
    falhas.push("ACL: falta o revoke de public/anon/authenticated");
  const inscricao = trigger(sql, "followup_enrollments");
  for (const col of ["organization_id", "pointer_id", "version_id"])
    if (!inscricao.includes(col)) falhas.push(`trigger de followup_enrollments não cobre ${col}`);
  const versao = trigger(sql, "followup_flow_versions");
  for (const col of ["organization_id", "pointer_id"])
    if (!versao.includes(col)) falhas.push(`trigger de followup_flow_versions não cobre ${col}`);
  return falhas;
}

describe("baseline: inscrição e versão só apontam para fluxo da própria organização (9024)", () => {
  it("função, ACL e as duas triggers estão no baseline", () => {
    expect(conferir(BASELINE)).toEqual([]);
  });

  it("controle negativo: sem as triggers, a cerca acusa", () => {
    const semTriggers = BASELINE.replace(/create trigger trg_followup_mesma_organizacao[\s\S]*?;\n/g, "");
    expect(semTriggers).not.toBe(BASELINE);
    expect(conferir(semTriggers)).toEqual(
      expect.arrayContaining([
        "trigger de followup_enrollments não cobre pointer_id",
        "trigger de followup_flow_versions não cobre pointer_id",
      ]),
    );
  });

  it("controle negativo: sem a conferência da versão, a cerca acusa", () => {
    const semVersao = BASELINE.replace(/v\.id = new\.version_id and v\.organization_id = new\.organization_id/g, "v.id = new.version_id");
    expect(conferir(semVersao)).toContain("não confere a org da versão");
  });
});
