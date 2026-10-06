/**
 * ETIQUETAS DA CONVERSA POR DELTA (migration 9044) — a rota e as duas telas.
 *
 * O PATCH gravava a lista inteira que a tela tinha carregado, e quem gravava por
 * último vencia (achado do @Cassio_SecRev). Aqui se mede o lado TypeScript:
 *   - a rota chama `fn_conversa_tags_alterar` com o delta, pela sessão, e NÃO
 *     regrava `conversations.tags`;
 *   - o formato antigo `{ tags }` continua regravando (compatibilidade);
 *   - o erro da função vira o código certo da API;
 *   - o editor manda só o delta, e o hook monta o corpo só com o lado preenchido.
 * O efeito no banco (concorrência, remoção só do pedido, guardas) é do invariante
 * `tests/invariants/tags-da-conversa-por-delta-9044.test.ts`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as HooksDeTags from "@/hooks/inbox/useConversationTags";
import type { HandlerCtx } from "@/lib/api/handlers/types";

const auditar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ audit: auditar }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
const logErro = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ logger: { error: logErro, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/inbox/useConversationTags", async (original) => ({
  ...(await original<typeof HooksDeTags>()),
  useUpdateConversationTags: () => ({ mutate, isPending: false }),
  useConversationTagVocabulary: () => ({ data: ["quente"] }),
}));

import { patchConversationHandler } from "@/app/api/v1/conversations/_handler";
import { erroDoDelta } from "@/app/api/v1/conversations/_tags-delta";
import { ConversationTagsEditor } from "@/components/inbox/ConversationTagsEditor";
import { corpoDoDelta } from "@/hooks/inbox/useConversationTags";

const ORG = "00000000-0000-4000-8000-0000000000aa";
const CONVERSA = "00000000-0000-4000-8000-0000000000bb";
const ctx: HandlerCtx = {
  organization_id: ORG,
  actor: { type: "user", id: "u-1" },
  requestId: "req-1",
  idioma: "pt-BR",
};

/** Client de sessão falso: registra a RPC e o que foi para `from().update()`. */
function sessaoFalsa(rpcResposta: { data: unknown; error: unknown } = { data: ["vip", "novo"], error: null }) {
  const updates: unknown[] = [];
  const rpc = vi.fn().mockResolvedValue(rpcResposta);
  const linha = { id: CONVERSA, organization_id: ORG, tags: ["vip", "novo"] };
  const cadeia = {
    update: (u: unknown) => (updates.push(u), cadeia),
    select: () => cadeia,
    eq: () => cadeia,
    maybeSingle: () => Promise.resolve({ data: linha, error: null }),
  };
  const supabase = { rpc, from: vi.fn(() => cadeia) };
  return { supabase: supabase as never, rpc, updates };
}

beforeEach(() => {
  auditar.mockReset();
  mutate.mockReset();
});

describe("PATCH da conversa com delta de etiquetas", () => {
  it("chama a função do banco com o delta e não regrava a lista", async () => {
    const { supabase, rpc, updates } = sessaoFalsa();
    await patchConversationHandler(supabase, ctx, CONVERSA, {
      tags_adicionar: ["novo"],
      tags_remover: ["frio"],
    });
    expect(rpc).toHaveBeenCalledWith("fn_conversa_tags_alterar", {
      p_org: ORG,
      p_conversa: CONVERSA,
      p_adicionar: ["novo"],
      p_remover: ["frio"],
    });
    expect(updates).toEqual([]);
  });

  it("só um lado: o outro vai como lista vazia", async () => {
    const { supabase, rpc } = sessaoFalsa();
    await patchConversationHandler(supabase, ctx, CONVERSA, { tags_remover: ["frio"] });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_adicionar: [], p_remover: ["frio"] });
  });

  it("audita o delta pedido e a lista que ficou", async () => {
    const { supabase } = sessaoFalsa();
    await patchConversationHandler(supabase, ctx, CONVERSA, { tags_adicionar: ["novo"] });
    expect(auditar).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversation.tags_changed",
        metadata: expect.objectContaining({
          tags_adicionar: ["novo"],
          tags_remover: [],
          tags: ["vip", "novo"],
        }),
      }),
    );
  });

  it("o formato antigo { tags } continua regravando a lista, sem a função", async () => {
    const { supabase, rpc, updates } = sessaoFalsa();
    await patchConversationHandler(supabase, ctx, CONVERSA, { tags: ["vip"] });
    expect(rpc).not.toHaveBeenCalled();
    expect(updates).toEqual([{ tags: ["vip"] }]);
    expect(auditar.mock.calls[0]?.[0]?.metadata).toMatchObject({ tags: ["vip"] });
  });

  it("erro da função interrompe antes do select e do audit", async () => {
    const { supabase } = sessaoFalsa({ data: null, error: { code: "P0002", message: "conversa_nao_encontrada" } });
    await expect(
      patchConversationHandler(supabase, ctx, CONVERSA, { tags_adicionar: ["novo"] }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(auditar).not.toHaveBeenCalled();
  });
});

describe("erro da função → contrato da API", () => {
  it.each([
    [{ code: "42501", message: "tags_mfa_required" }, 403, "mfa_required"],
    [{ code: "42501", message: "tags_etiqueta_do_sistema" }, 409, "etiqueta_do_sistema"],
    [{ code: "42501", message: "tags_forbidden" }, 403, "forbidden"],
    [{ code: "P0002", message: "conversa_nao_encontrada" }, 404, "not_found"],
    [{ code: "23514", message: "tags_limite" }, 422, "validation_failed"],
    [{ code: "22023", message: "tags_delta_invalido" }, 422, "validation_failed"],
    [{ code: "XX000", message: "boom" }, 500, "internal_error"],
  ])("%o → %i %s", (erro, status, code) => {
    expect(erroDoDelta(erro, ctx)).toMatchObject({ status, code });
  });

  it("o 500 não devolve o texto do banco; o detalhe vai para o log do servidor", () => {
    logErro.mockReset();
    const e = erroDoDelta({ code: "XX000", message: "relation conversations: detalhe interno" }, ctx);
    expect(e.message).toBe("Não foi possível alterar as etiquetas.");
    expect(logErro).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "XX000", message: "relation conversations: detalhe interno" }),
    );
  });
});

describe("telas mandam só o delta", () => {
  it("o hook monta o corpo só com o lado preenchido", () => {
    expect(corpoDoDelta({ conversation_id: "c", adicionar: ["vip"] })).toEqual({ tags_adicionar: ["vip"] });
    expect(corpoDoDelta({ conversation_id: "c", remover: ["vip"] })).toEqual({ tags_remover: ["vip"] });
    expect(corpoDoDelta({ conversation_id: "c", adicionar: [], remover: ["a"] })).toEqual({ tags_remover: ["a"] });
  });

  it("o editor acrescenta e remove por delta, sem levar as outras etiquetas", () => {
    render(<ConversationTagsEditor conversationId={CONVERSA} orgId={ORG} tags={["vip", "retorno"]} />);

    fireEvent.click(screen.getByRole("button", { name: /Remover tag vip/ }));
    expect(mutate).toHaveBeenLastCalledWith({ conversation_id: CONVERSA, remover: ["vip"] });

    fireEvent.change(screen.getByLabelText("Adicionar tag à conversa"), { target: { value: "  Novo " } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar tag" }));
    expect(mutate).toHaveBeenLastCalledWith({ conversation_id: CONVERSA, adicionar: ["novo"] });

    fireEvent.click(screen.getByRole("button", { name: /quente/ }));
    expect(mutate).toHaveBeenLastCalledWith({ conversation_id: CONVERSA, adicionar: ["quente"] });
  });
});
