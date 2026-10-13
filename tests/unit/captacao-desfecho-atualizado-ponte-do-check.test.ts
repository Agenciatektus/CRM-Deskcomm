import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #2316 — o desfecho `atualizado` existe no TypeScript e ainda NÃO no banco.
 *
 * O CHECK da migration 0174 só aceita `'criado'/'duplicado'/'recusado'`, e
 * `registrarCaptacao` tem promessa escrita no próprio cabeçalho: NUNCA LANÇAR.
 * Sem ponte, todo card atualizado por reenvio gravaria um erro no log e SUMIRIA
 * da tela "Leads recebidos" — justamente o registro que o gatilho de
 * anonimização alcança (o vínculo lead/contato mora nele).
 *
 * Estes testes fixam a ponte: um `23514` vindo do CHECK de `outcome` repete a
 * inserção como `duplicado` (a linha fica, com o vínculo); qualquer outra
 * recusa continua sendo erro, e nenhuma delas lança.
 */

const h = vi.hoisted(() => ({
  linhas: [] as Array<Record<string, unknown>>,
  /** one-shot: devolvido só na primeira inserção que o receber. */
  erro: null as { code: string; message: string } | null,
}));

import { registrarCaptacao } from "@/lib/webhooks/captacao";

type AdminDoTeste = Parameters<typeof registrarCaptacao>[0];

/** O cliente mínimo que `registrarCaptacao` usa: um `from().insert()`. */
function cliente(): AdminDoTeste {
  return {
    from: () => ({
      insert: async (linha: Record<string, unknown>) => {
        h.linhas.push(linha);
        const erro = h.erro;
        h.erro = null;
        return { error: erro };
      },
    }),
  } as unknown as AdminDoTeste;
}

const CAPTACAO = {
  organizationId: "org-1",
  webhookSourceId: "fonte-1",
  sourceName: "Integração do diagnóstico",
  leadId: "lead-1",
  contactId: "contato-1",
} as const;

const VIOLACAO_DO_CHECK = {
  code: "23514",
  message:
    'new row for relation "webhook_lead_captures" violates check constraint "webhook_lead_captures_outcome_check"',
};

beforeEach(() => {
  h.linhas.length = 0;
  h.erro = null;
});

describe("o desfecho atualizado e o CHECK que ainda não o sabe (#2316)", () => {
  it("⭐ o banco aceita o valor: UMA inserção, já com o desfecho correto", async () => {
    await registrarCaptacao(cliente(), { ...CAPTACAO, outcome: "atualizado" });

    expect(h.linhas.map((l) => l.outcome)).toEqual(["atualizado"]);
    expect(h.linhas[0]).toMatchObject({ lead_id: "lead-1", contact_id: "contato-1" });
  });

  it("⭐ o CHECK derruba `atualizado`: repete como `duplicado` — a linha NÃO some", async () => {
    h.erro = VIOLACAO_DO_CHECK;

    await registrarCaptacao(cliente(), { ...CAPTACAO, outcome: "atualizado" });

    expect(h.linhas.map((l) => l.outcome)).toEqual(["atualizado", "duplicado"]);
    expect(h.linhas[1]).toMatchObject({ lead_id: "lead-1", contact_id: "contato-1" });
  });

  it("a ponte só liga para `atualizado`: outro desfecho derrubado NÃO é regravado", async () => {
    h.erro = VIOLACAO_DO_CHECK;

    await registrarCaptacao(cliente(), { ...CAPTACAO, outcome: "criado" });

    expect(h.linhas.map((l) => l.outcome)).toEqual(["criado"]);
  });

  it("recusa que não é do CHECK (sem ponte) e ponte que também falha: nada lança", async () => {
    h.erro = { code: "42501", message: "permission denied" };
    await expect(
      registrarCaptacao(cliente(), { ...CAPTACAO, outcome: "atualizado" }),
    ).resolves.toBeUndefined();
    expect(
      h.linhas.map((l) => l.outcome),
      "sem ponte: uma linha só",
    ).toEqual(["atualizado"]);

    h.linhas.length = 0;
    h.erro = VIOLACAO_DO_CHECK;
    await expect(
      registrarCaptacao(cliente(), { ...CAPTACAO, outcome: "atualizado" }),
    ).resolves.toBeUndefined();
    expect(h.linhas.map((l) => l.outcome)).toEqual(["atualizado", "duplicado"]);
  });
});
