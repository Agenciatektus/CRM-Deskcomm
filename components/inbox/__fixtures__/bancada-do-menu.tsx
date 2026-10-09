/**
 * A bancada dos testes do menu de contexto da conversa: uma linha da lista com
 * o menu ligado, do mesmo jeito que a `ConversationList` liga, mais um botão
 * "fora" para o clique fora. Os `vi.mock` ficam em cada arquivo de teste (o
 * vitest os iça por arquivo); aqui só o que não depende deles.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, type Mock } from "vitest";

import { MenuDaConversa } from "@/components/inbox/menu/MenuDaConversa";
import { useMenuDaConversa } from "@/components/inbox/menu/useMenuDaConversa";
import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

import { conversaDeExemplo } from "./conversa";

export const LEAD = {
  id: "lead-1",
  title: "Negócio",
  status: "open",
  pipeline_id: "pipe-1",
  stage_id: "st-1",
  updated_at: "2026-10-01T10:00:00.000Z",
  funil_nome: "Vendas",
  etapa_nome: "Novo",
  etapas: [
    { id: "st-1", name: "Novo", is_won: false, is_lost: false },
    { id: "st-2", name: "Proposta", is_won: false, is_lost: false },
  ],
};

export function rede(api: Record<"get" | "post" | "patch" | "delete", Mock>) {
  api.get.mockImplementation(async (url: string) => {
    if (url === "/api/v1/team/assignable")
      return { data: [{ user_id: "u2", role: "agent", full_name: "Bruno Sales" }, { user_id: "u1", role: "agent", full_name: "Eu" }] };
    if (url === "/api/v1/conversation-tags") return { data: ["vip", "retorno"] };
    if (url.endsWith("/crm-summary")) return { data: { leads: [LEAD] } };
    return { data: null };
  });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue(undefined);
}

function Bancada({ conversa }: { conversa: ConversationWithContact }) {
  const menu = useMenuDaConversa();
  return (
    <>
      <ConversationListItem
        conversation={conversa}
        isSelected={false}
        onSelect={() => {}}
        onAbrirMenu={menu.abrir}
        menuAberto={menu.alvo?.id === conversa.id}
        meuUserId="u1"
        automaticoDaOrg
      />
      <button type="button">fora</button>
      <MenuDaConversa
        alvo={menu.alvo}
        conversation={menu.alvo ? conversa : null}
        onFechar={menu.fechar}
        meuUserId="u1"
        automaticoDaOrg
      />
    </>
  );
}

export function montar(extra: Partial<ConversationWithContact> = {}) {
  const conversa = { ...conversaDeExemplo.conversation, ...extra } as ConversationWithContact;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Bancada conversa={conversa} />
    </QueryClientProvider>,
  );
  return { linha: document.querySelector<HTMLElement>("[data-conversation-id]")! };
}

export const item = (nome: RegExp | string) => screen.getByRole("menuitem", { name: nome });
export const semItem = (nome: RegExp | string) => expect(screen.queryByRole("menuitem", { name: nome })).toBeNull();

