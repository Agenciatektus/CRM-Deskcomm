import { describe, expect, it, vi } from "vitest";

import { aplicarObjetivo, objetivoAtingido, type ConducaoDoObjetivo, type ObjetivoDb } from "./objetivo";

const ORG = "org-1";
const CONDUCAO: ConducaoDoObjetivo = {
  id: "cond-1",
  conversation_id: "cv-1",
  contact_id: "ct-1",
  lead_id: "lead-1",
  etapa_alvo_id: "etapa-alvo",
  pointer_id: "ptr-1",
};

function fake(opts: {
  conducao?: ConducaoDoObjetivo | null;
  lead?: { stage_id: string | null; status: string | null } | null;
  encerrou?: boolean;
}) {
  const passar = vi.fn(async () => undefined);
  const encerrar = vi.fn(async () => opts.encerrou ?? true);
  const conducaoVivaDoLead = vi.fn(async (_o: string, leadId: string) =>
    opts.conducao === undefined ? (leadId === CONDUCAO.lead_id ? CONDUCAO : null) : opts.conducao,
  );
  const db: ObjetivoDb = {
    conducaoVivaDoLead,
    lead: async () => (opts.lead === undefined ? { stage_id: "etapa-alvo", status: "open" } : opts.lead),
    encerrar,
    passarParaHumano: passar,
  };
  return { db, passar, encerrar, conducaoVivaDoLead };
}

const evento = (event_type: string, entity_id: string | null = "lead-1") => ({
  organization_id: ORG,
  event_type,
  entity_id,
  payload: { to_stage_id: "etapa-alvo" },
});

describe("objetivo da condução", () => {
  it("payload diz etapa-alvo mas o BANCO diz outra etapa → não age (forja não produz efeito)", async () => {
    const f = fake({ lead: { stage_id: "outra", status: "open" } });
    expect(await aplicarObjetivo(f.db, evento("lead.stage_changed"))).toBe("objetivo_nao_atingido");
    expect(f.encerrar).not.toHaveBeenCalled();
    expect(f.passar).not.toHaveBeenCalled();
  });

  it("lead na etapa-alvo → encerra e passa para humano 1x (controle positivo)", async () => {
    const f = fake({});
    expect(await aplicarObjetivo(f.db, evento("lead.stage_changed"))).toBe("objetivo_atingido");
    expect(f.encerrar).toHaveBeenCalledWith(ORG, "cond-1");
    expect(f.passar).toHaveBeenCalledTimes(1);
  });

  it("lead.won (entity_kind 'lead', vindo de fn_log_event) → objetivo, mesmo fora da etapa", async () => {
    const f = fake({ lead: { stage_id: "qualquer", status: "won" } });
    expect(await aplicarObjetivo(f.db, evento("lead.won"))).toBe("objetivo_atingido");
  });

  it("encerrar=false (corrida, já encerrada) → não passa de novo", async () => {
    const f = fake({ encerrou: false });
    expect(await aplicarObjetivo(f.db, evento("lead.stage_changed"))).toBe("ja_encerrada");
    expect(f.passar).not.toHaveBeenCalled();
  });

  it("condução de outro lead → nada", async () => {
    const f = fake({});
    expect(await aplicarObjetivo(f.db, evento("lead.stage_changed", "lead-9"))).toBe("sem_conducao");
    expect(f.passar).not.toHaveBeenCalled();
  });

  it("sem entity_id ou evento que não é de lead → nada", async () => {
    const f = fake({});
    expect(await aplicarObjetivo(f.db, evento("lead.stage_changed", null))).toBe("sem_lead");
    expect(await aplicarObjetivo(f.db, evento("contact.tag_added", "lead-1"))).toBe("sem_lead");
    expect(f.conducaoVivaDoLead).not.toHaveBeenCalled();
  });

  it("objetivoAtingido: etapa ou ganho", () => {
    expect(objetivoAtingido({ stage_id: "a", status: "open" }, "a")).toBe(true);
    expect(objetivoAtingido({ stage_id: "b", status: "won" }, "a")).toBe(true);
    expect(objetivoAtingido({ stage_id: "b", status: "lost" }, "a")).toBe(false);
  });
});
