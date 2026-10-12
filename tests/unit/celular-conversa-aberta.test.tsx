/**
 * M2.3: a conversa aberta no celular. Barra do protótipo (voltar, quem é, canal e
 * quem atende, Ligar, ⋮), faixa do negócio com a folha "Mover etapa", o menu com o
 * lead primeiro, o composer acima do teclado e os balões na largura do celular.
 */
import { readFileSync } from "node:fs";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/voice/DialButton", () => ({ DialButton: () => <button type="button">Ligar</button> }));
vi.mock("@/components/inbox/menu/DialogosDoMenu", () => ({ DialogosDoMenu: () => null }));
vi.mock("@/lib/mobile/useEhCelular", () => ({ useEhCelular: () => true }));
const papel = vi.hoisted(() => ({ podeMover: true, suporte: null as null | { access_mode: string } }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { support: papel.suporte } }),
  usePermission: () => papel.podeMover,
}));
const funil = vi.hoisted(() => ({ escolher: vi.fn(), lead: null as unknown }));
vi.mock("@/hooks/inbox/useFunilDoContato", () => ({
  useFunilDoContato: () => ({
    lead: funil.lead,
    etapas: [
      { id: "e1", name: "Novo", is_won: false, is_lost: false },
      { id: "e2", name: "Proposta", is_won: false, is_lost: false },
    ],
    indiceAtual: 0,
    escolher: funil.escolher,
    mover: { isPending: false },
    ganhar: { isPending: false },
  }),
}));

import { BarraDaConversaNoCelular, FaixaDoLead } from "@/components/mobile/telas/ConversaAberta";

const CONVERSA = {
  id: "c-1",
  status: "open",
  assigned_to_user_id: "u-1",
  assigned_to_user_name: "Paula",
  is_group: false,
  channel_sessions: { provider: "waha" },
  contacts: { id: "k-1", display_name: "Maria Souza", phone_number: "+55 11 90000-0001" },
} as never;

describe("barra da conversa no celular", () => {
  it("voltar, nome com canal e quem atende, Ligar e o ⋮", () => {
    const onVoltar = vi.fn();
    const onAbrirFicha = vi.fn();
    const onAbrirMenu = vi.fn();
    render(
      <BarraDaConversaNoCelular
        conversation={CONVERSA}
        meuUserId="u-1"
        onVoltar={onVoltar}
        onAbrirFicha={onAbrirFicha}
        onAbrirMenu={onAbrirMenu}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onVoltar).toHaveBeenCalled();
    const quem = screen.getByRole("button", { name: /Abrir ficha de/ });
    expect(quem.textContent).toContain("Maria Souza");
    expect(quem.textContent).toContain("Você está atendendo");
    fireEvent.click(quem);
    expect(onAbrirFicha).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ações da conversa" }));
    expect(onAbrirMenu).toHaveBeenCalledWith(expect.any(HTMLElement));
    // Ligar pede confirmação: a folha "Ligar para Maria Souza?" traz o botão de verdade.
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    expect(screen.getByRole("dialog", { name: "Ligar para Maria Souza?" })).toBeInTheDocument();
  });
});

describe("faixa do negócio", () => {
  it("sem negócio, não aparece", () => {
    funil.lead = null;
    const { container } = render(<FaixaDoLead contactId="k-1" />);
    expect(container.textContent).toBe("");
  });

  it("etapa, funil e valor; tocar abre Mover etapa e escolher move", () => {
    funil.lead = { id: "l-1", status: "open", etapa_nome: "Novo", funil_nome: "Vendas", value_cents: 150000, currency: "BRL" };
    render(<FaixaDoLead contactId="k-1" />);
    const faixa = screen.getByRole("button", { name: /Negócio: Novo, Vendas/ });
    expect(faixa.textContent).toMatch(/1\.500,00/);
    fireEvent.click(faixa);
    fireEvent.click(screen.getByRole("button", { name: "Proposta" }));
    expect(funil.escolher).toHaveBeenCalledWith("e2");
  });
});

describe("faixa do negócio só informativa para quem não pode mover (P2-1 do Cassio na #180)", () => {
  it("viewer e suporte somente leitura: a faixa não abre a folha", () => {
    funil.lead = { id: "l-1", status: "open", etapa_nome: "Novo", funil_nome: "Vendas", value_cents: null, currency: null };
    papel.podeMover = false;
    const { unmount } = render(<FaixaDoLead contactId="k-1" />);
    expect(screen.getByRole("button", { name: /Negócio: Novo/ })).toBeDisabled();
    unmount();
    papel.podeMover = true;
    papel.suporte = { access_mode: "support_readonly" };
    render(<FaixaDoLead contactId="k-1" />);
    expect(screen.getByRole("button", { name: /Negócio: Novo/ })).toBeDisabled();
    papel.suporte = null;
  });
});

describe("ligações da conversa no celular", () => {
  it("o menu da conversa aberta põe o lead primeiro", () => {
    const fonte = readFileSync("components/inbox/menu/ConteudoDoMenu.tsx", "utf8");
    expect(fonte).toMatch(/leadPrimeiro && regras\.funil/);
    expect(fonte).toMatch(/!leadPrimeiro && regras\.funil/);
    expect(readFileSync("components/inbox/InboxLayout.tsx", "utf8")).toMatch(/leadPrimeiro\n/);
  });

  it("o cabeçalho do desktop some no celular; os balões usam 84% lá", () => {
    expect(readFileSync("components/inbox/ConversationHeader.tsx", "utf8")).toContain("mb:hidden");
    expect(readFileSync("components/inbox/bolha/estilo.ts", "utf8")).toContain("mb:max-w-[84%]");
  });

  it("composer acima do teclado: resizes-content e o --mb-teclado na altura", () => {
    expect(readFileSync("app/layout.tsx", "utf8")).toMatch(/interactiveWidget: "resizes-content"/);
    expect(readFileSync("components/inbox/InboxLayout.tsx", "utf8")).toContain("var(--mb-teclado,0px)");
  });
});
