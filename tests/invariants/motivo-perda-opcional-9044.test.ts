import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261007150000_9044_motivo_perda_opcional_por_funil.sql",
  "utf8",
).toLowerCase();
const baseline = readFileSync("supabase/baseline.sql", "utf8").toLowerCase();

describe("9044 — motivo de perda opcional por funil", () => {
  it("remove a CHECK global e conserva obrigatório como padrão", () => {
    expect(migration).toContain("drop constraint if exists crm_leads_lost_reason_required");
    expect(migration).toContain("v_required boolean := true");
    expect(migration).toContain("settings->'lost_reason_required' <> 'false'::jsonb");
    expect(baseline).not.toContain('constraint "crm_leads_lost_reason_required" check');
  });

  it("valida também quando a perda nasce da troca de etapa", () => {
    const colunas = "update of status, lost_reason, stage_id, pipeline_id";
    expect(migration).toContain(colunas);
    expect(baseline).toContain(
      'update of "status", "lost_reason", "stage_id", "pipeline_id"',
    );
  });

  it("continua validando o vocabulário quando o motivo opcional é informado", () => {
    expect(migration).toContain("lost_reason_invalid");
    expect(migration).toContain("new.lost_reason = any (v_pipeline_extra)");
  });
});
