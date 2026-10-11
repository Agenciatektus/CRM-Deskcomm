/**
 * O MOTOR DE REGRAS NÃO FALA COM QUEM ENTROU EM LOTE.
 *
 * ═══ O defeito, e por que ele passou por uma revisão ═══
 *
 * `lead.created` tem DOIS consumidores: o gatilho de follow-up
 * (`lib/followup/gatilho-lead.ts`) e este motor de regras. A criação de card em
 * lote (importar planilha, iniciar campanha com passos) foi tampada só no
 * primeiro. Com a régua da campanha criando um card por pessoa abordada, um
 * tenant com a regra "quando entrar lead novo → mandar WhatsApp" receberia:
 *
 *     500 cards → 500 lead.created → o gatilho PULA → o motor de regras MANDA
 *
 * Quinhentas mensagens de outro fluxo, no mesmo minuto em que a campanha falou
 * com essas mesmas 500 pessoas. Tampar um consumidor só dá a sensação de
 * resolvido: o motor não reclama, não falha, ele manda.
 *
 * ═══ O que estes testes fixam ═══
 *
 * O pulo é POR AÇÃO: quem fala não roda, quem só mexe no CRM roda. E o pulo
 * aparece como `skipped` com motivo — silêncio aqui seria a terceira versão do
 * mesmo defeito que `desfecho-do-envio.ts` existe para matar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerAction } from "@/lib/automation/actions";
import { runAutomationForEvent } from "@/lib/automation/engine";
import { ORIGEM_CAMPANHA } from "@/lib/campanhas/origem-do-lead";
import { ORIGEM_DA_PLANILHA } from "@/lib/leads/planilha";
import type { EventRow } from "@/lib/event-log/dispatcher";

const falou = vi.fn();
const etiquetou = vi.fn();

/** Duas ações de teste: uma declara que fala com o cliente, a outra não. */
registerAction({
  type: "teste_que_fala",
  falaComOCliente: true,
  execute: async () => {
    falou();
    return { type: "teste_que_fala", status: "success" as const };
  },
});
registerAction({
  type: "teste_que_nao_fala",
  execute: async () => {
    etiquetou();
    return { type: "teste_que_nao_fala", status: "success" as const };
  },
});

const REGRA = {
  id: "regra-1",
  name: "Quando entrar lead novo",
  conditions: [],
  actions: [{ type: "teste_que_fala", config: {} }, { type: "teste_que_nao_fala", config: {} }],
};

/** Cliente mínimo: um resultado canned por tabela; guarda o run gravado. */
function supabaseFake() {
  const runs: Record<string, unknown>[] = [];
  const porTabela: Record<string, unknown> = {
    automation_rules: [REGRA],
    crm_leads: { id: "lead-1", organization_id: "org-1", contact_id: null },
  };
  const client = {
    from: (tabela: string) => {
      const enc: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "in", "is", "not", "gte", "update", "delete"]) {
        enc[m] = () => enc;
      }
      const dados = porTabela[tabela] ?? null;
      enc.maybeSingle = () => Promise.resolve({ data: Array.isArray(dados) ? dados[0] : dados, error: null });
      enc.single = () => Promise.resolve({ data: Array.isArray(dados) ? dados[0] : dados, error: null });
      enc.then = (fn: (r: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(fn);
      enc.insert = (linha: Record<string, unknown>) => {
        if (tabela === "automation_rule_runs") runs.push(linha);
        return enc;
      };
      return enc;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, runs };
}

function evento(via?: string): EventRow {
  return {
    id: "evt-1",
    organization_id: "org-1",
    event_type: "lead.created",
    entity_kind: "crm_lead",
    entity_id: "lead-1",
    payload: {},
    metadata: via ? { via } : {},
    created_at: "2026-10-05T12:00:00Z",
  } as unknown as EventRow;
}

describe("runAutomationForEvent — criação em lote não fala", () => {
  beforeEach(() => {
    falou.mockClear();
    etiquetou.mockClear();
  });

  it("CARD DE CAMPANHA: a ação que fala NÃO roda; a que só mexe no CRM roda", async () => {
    const { client, runs } = supabaseFake();
    await runAutomationForEvent(client, evento(ORIGEM_CAMPANHA));
    expect(falou).not.toHaveBeenCalled();
    expect(etiquetou).toHaveBeenCalledTimes(1);
    // E o pulo fica VISÍVEL, com motivo, na aba Atividade.
    const resultados = (runs[0]?.actions_result ?? []) as Array<Record<string, unknown>>;
    const pulada = resultados.find((r) => r.type === "teste_que_fala");
    expect(pulada?.status).toBe("skipped");
    expect((pulada?.detail as Record<string, unknown>)?.reason).toBe("criacao_em_lote");
  });

  it("IMPORTAÇÃO DE PLANILHA: mesma régua", async () => {
    const { client } = supabaseFake();
    await runAutomationForEvent(client, evento(ORIGEM_DA_PLANILHA));
    expect(falou).not.toHaveBeenCalled();
    expect(etiquetou).toHaveBeenCalledTimes(1);
  });

  it("CARD DE UM EM UM: a ação que fala roda — é para isso que a regra existe", async () => {
    // Controle negativo: sem ele, um pulo largo demais deixaria os dois testes
    // acima verdes com o motor nunca mandando nada, para ninguém.
    const { client } = supabaseFake();
    await runAutomationForEvent(client, evento());
    expect(falou).toHaveBeenCalledTimes(1);
    expect(etiquetou).toHaveBeenCalledTimes(1);
  });
});
