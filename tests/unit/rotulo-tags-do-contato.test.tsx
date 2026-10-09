import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CRMSidePanel } from "@/components/inbox/CRMSidePanel";

/**
 * O botão que abre as tags DO CONTATO dizia só "Tag" (#852, item 4), enquanto o
 * mesmo painel tem a seção "Tags da conversa" logo abaixo. Quem atende não sabia
 * em qual dos dois estava mexendo — relatado por quem usa. O rótulo é a única
 * coisa que distingue os dois lugares na tela.
 */

const CONTACT = "c0000000-0000-4000-8000-000000000001";

const conversation = {
  id: "cv-1",
  organization_id: "org-1",
  contact_id: CONTACT,
  tags: [],
  contacts: { id: CONTACT, display_name: "Fulana", name: null, phone_number: "5511999", tags: [] },
} as unknown as React.ComponentProps<typeof CRMSidePanel>["conversation"];

const get = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => get(...args), post: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/hooks/pipelines/useDefaultPipeline", () => ({
  useDefaultPipeline: () => ({ data: null, isError: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useUpdateConversationTags: () => ({ mutate: vi.fn(), isPending: false }),
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutate: vi.fn(), isPending: false }),
}));
// `usePermission` entrou com as abas (visual v2): o painel lê a permissão de
// gravar. Com `true` o botão fica habilitado, como para quem atende.
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u-1", support: null } }),
  usePermission: () => true,
}));

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: { leads: [], orders: [], activities: [], demandas: [], fatos: [], historico: [] } });
});

describe("painel do inbox — o botão de tags diz de quem é a tag", () => {
  // Visual v2: o texto VISÍVEL virou "+ Etiqueta" (o rótulo curto do protótipo),
  // mas o NOME ACESSÍVEL continua dizendo de quem é: "Etiqueta do contato". É
  // ele que distingue este botão da seção "Tags da conversa" para quem usa leitor
  // de tela e para o `title` de quem passa o mouse.
  it("o botão se chama 'Etiqueta do contato', e não só 'Tag' ou 'Etiqueta'", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CRMSidePanel conversation={conversation} />
      </QueryClientProvider>,
    );

    const botao = await screen.findByRole("button", { name: "Etiqueta do contato" });
    expect(botao).toHaveAttribute("title", "Etiqueta do contato");
    // Guarda contra a volta do rótulo ambíguo: "Tag"/"Etiqueta" exatos, não o prefixo.
    expect(screen.queryByRole("button", { name: "Tag" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Etiqueta" })).toBeNull();
  });
});
