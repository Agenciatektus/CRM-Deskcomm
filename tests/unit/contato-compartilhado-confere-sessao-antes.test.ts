/**
 * "Conversar com" no cartão de contato: a sessão de canal é conferida ANTES de
 * qualquer contato ser criado.
 *
 * Origem: parecer do Cassio na #164. A vitrine do design system mandava um
 * `channel_session_id` de amostra para `/api/v1/conversations/open-with-contact`,
 * e a suspeita era que `fn_upsert_wa_contact` gravasse o contato na organização
 * antes de a rota responder 404 `session_not_found`. Conferido em `origin/dev`:
 * a ordem já é sessão → contato. Esta cerca impede que uma refatoração a
 * inverta sem ninguém ver, porque a inversão não quebra nada na tela: a rota
 * responde o mesmo 404 e o contato órfão fica no banco do cliente.
 *
 * Controle negativo: com a sessão válida, o MESMO caminho chega ao upsert. Sem
 * ele, um teste que nunca alcançasse o upsert passaria pelos motivos errados.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/channels/contato-por-telefone", () => ({
  encontrarContatoPorTelefone: vi.fn(async () => null),
}));
vi.mock("@/lib/automation/start-conversation", () => ({
  ensureConversation: vi.fn(async () => "conversa-1"),
  sessaoProntaParaEnvio: vi.fn(async () => null),
}));

import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";

const ORG = "11111111-1111-4111-8111-111111111111";
const SESSAO = "22222222-2222-4222-8222-222222222222";

/** Um admin falso: `channel_sessions` responde `sessao`; `rpc` só registra. */
function adminFalso(sessao: { id: string } | null) {
  const rpc = vi.fn(async () => ({ data: "contato-novo", error: null }));
  const tabelas: string[] = [];
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({ data: sessao, error: null }),
  };
  const admin = {
    from: (tabela: string) => {
      tabelas.push(tabela);
      return consulta;
    },
    rpc,
  };
  return { admin: admin as never, rpc, tabelas };
}

const entrada = { channel_session_id: SESSAO, phone_number: "+5511977770000", name: "Carla Dias" };

describe("contato compartilhado: sessão antes do contato", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sessão que não é da organização: nenhum contato é criado", async () => {
    const { admin, rpc, tabelas } = adminFalso(null);
    await expect(openSharedContactConversation(admin, ORG, entrada)).rejects.toThrow("session_not_found");
    expect(rpc).not.toHaveBeenCalled();
    expect(tabelas).not.toContain("contacts");
  });

  it("sem sessão nenhuma (nem informada nem pronta): nenhum contato é criado", async () => {
    const { admin, rpc } = adminFalso(null);
    await expect(
      openSharedContactConversation(admin, ORG, { phone_number: "+5511977770000", name: "Carla Dias" }),
    ).rejects.toThrow("session_not_found");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("controle: com a sessão válida, o mesmo caminho chega ao upsert do contato", async () => {
    const { admin, rpc } = adminFalso({ id: SESSAO });
    const r = await openSharedContactConversation(admin, ORG, entrada);
    expect(rpc).toHaveBeenCalledWith("fn_upsert_wa_contact", expect.objectContaining({ p_org: ORG }));
    expect(r).toEqual({ conversation_id: "conversa-1", contact_id: "contato-novo" });
  });
});
