import { describe, expect, it } from "vitest";

import { cadenceSettingsSchema, CADENCE_SETTINGS_PADRAO } from "../settings";
import {
  CONDUCAO_PADRAO,
  INSTRUCAO_MAX,
  conducaoDaCadenciaSchema,
  conducaoDe,
  conducaoIlegivel,
} from "./settings";

const AGENTE = "11111111-1111-4111-8111-111111111111";
const ETAPA = "22222222-2222-4222-8222-222222222222";
const ia = { quem_atende: "ia", agent_id: AGENTE, preset: "agendar_reuniao", etapa_alvo_id: ETAPA } as const;

describe("condução da cadência: schema", () => {
  it("atendente não exige mais nada", () => {
    expect(conducaoDaCadenciaSchema.parse({ quem_atende: "atendente" })).toEqual({ quem_atende: "atendente" });
  });

  it("atendente com campo de IA é recusado (strictObject)", () => {
    expect(conducaoDaCadenciaSchema.safeParse({ quem_atende: "atendente", agent_id: AGENTE }).success).toBe(false);
  });

  it("ia exige agente, objetivo e etapa-alvo", () => {
    expect(conducaoDaCadenciaSchema.safeParse(ia).success).toBe(true);
    for (const falta of ["agent_id", "preset", "etapa_alvo_id"] as const) {
      const { [falta]: _f, ...sem } = ia;
      expect(conducaoDaCadenciaSchema.safeParse(sem).success, falta).toBe(false);
    }
  });

  it("modo: ausente vira automatico (config antiga); assistido é aceito; valor inválido é recusado", () => {
    expect(conducaoDaCadenciaSchema.parse(ia)).toMatchObject({ modo: "automatico" });
    expect(conducaoDaCadenciaSchema.parse({ ...ia, modo: "assistido" })).toMatchObject({ modo: "assistido" });
    expect(conducaoDaCadenciaSchema.safeParse({ ...ia, modo: "sozinho" }).success).toBe(false);
  });

  it("instrução acima de 2000 caracteres é recusada; no limite passa", () => {
    expect(conducaoDaCadenciaSchema.safeParse({ ...ia, instrucao: "a".repeat(INSTRUCAO_MAX) }).success).toBe(true);
    expect(conducaoDaCadenciaSchema.safeParse({ ...ia, instrucao: "a".repeat(INSTRUCAO_MAX + 1) }).success).toBe(false);
  });

  it("preset desconhecido e chave desconhecida são recusados", () => {
    expect(conducaoDaCadenciaSchema.safeParse({ ...ia, preset: "cobrar" }).success).toBe(false);
    expect(conducaoDaCadenciaSchema.safeParse({ ...ia, tools: ["crm_list_leads"] }).success).toBe(false);
  });
});

describe("conducaoDe", () => {
  it("settings sem condução (cadência antiga) = atendente", () => {
    expect(conducaoDe(undefined)).toEqual(CONDUCAO_PADRAO);
    expect(conducaoDe(null)).toEqual(CONDUCAO_PADRAO);
    expect(conducaoDe({ janela: {} })).toEqual(CONDUCAO_PADRAO);
  });

  it("condução ilegível vira atendente (na dúvida, uma pessoa)", () => {
    expect(conducaoDe({ conducao: { quem_atende: "ia" } })).toEqual(CONDUCAO_PADRAO);
    expect(conducaoIlegivel({ conducao: { quem_atende: "ia" } })).toBe(true);
  });

  it("controle: condução válida é lida com o modo preenchido", () => {
    expect(conducaoDe({ conducao: ia })).toEqual({ ...ia, modo: "automatico" });
    expect(conducaoIlegivel({ conducao: ia })).toBe(false);
    expect(conducaoIlegivel({})).toBe(false);
  });
});

describe("cadence_settings aceita a condução", () => {
  const base = { ...CADENCE_SETTINGS_PADRAO, legal_basis_ref: "LIA teste" };
  it("padrão da tela nova: atendente", () => {
    expect(CADENCE_SETTINGS_PADRAO.conducao).toEqual({ quem_atende: "atendente" });
    expect(cadenceSettingsSchema.safeParse(base).success).toBe(true);
  });
  it("com IA válida passa; com IA incompleta não", () => {
    expect(cadenceSettingsSchema.safeParse({ ...base, conducao: ia }).success).toBe(true);
    expect(cadenceSettingsSchema.safeParse({ ...base, conducao: { quem_atende: "ia" } }).success).toBe(false);
  });
  it("sem o campo (cadência gravada antes) continua válida", () => {
    const { conducao: _c, ...semConducao } = base;
    expect(cadenceSettingsSchema.safeParse(semConducao).success).toBe(true);
  });
});
