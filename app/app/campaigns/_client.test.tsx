/** Campanhas: papel abaixo de manager sem permissão (exceto platform admin full); erro de rede segue como erro. */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ListaDeCampanhas } from "./_client";

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const consulta = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => auth.value }));
vi.mock("@/hooks/campanhas/useCampanhas", () => ({ useCampanhas: () => consulta.value }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/components/pagina", () => ({
  Pagina: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CabecalhoDaPagina: () => null,
  BarraDeFiltros: () => null,
  BotaoDaTelaParaRota: () => null,
  EstadoDaLista: ({ erro, children }: { erro: string | null; children: React.ReactNode }) => (erro ? <p>{erro}</p> : <>{children}</>),
}));
vi.mock("@/components/campanhas/EstadoDaCampanha", () => ({ EstadoDaCampanha: () => null }));
vi.mock("@/components/ui/escolha", () => ({ Escolha: () => null }));

const logar = (role: string, user: Record<string, unknown> = {}) => {
  auth.value = { user: { is_platform_admin: false, platform_admin_scope: null, support: null, ...user }, activeOrg: { role } };
};

describe("ListaDeCampanhas", () => {
  beforeEach(() => {
    consulta.value = { isLoading: false, isError: false, data: { pages: [{ data: [] }] }, refetch: vi.fn() };
  });

  it("agent comum vê o estado sem permissão", () => {
    logar("agent");
    render(<ListaDeCampanhas />);
    expect(screen.getByText("Você não tem permissão para ver nem criar campanhas.")).toBeTruthy();
  });

  it("platform admin full como agent vê a lista", () => {
    logar("agent", { is_platform_admin: true, platform_admin_scope: "full" });
    render(<ListaDeCampanhas />);
    expect(screen.queryByText("Você não tem permissão para ver nem criar campanhas.")).toBeNull();
  });

  it("manager com falha de rede continua com Erro ao carregar", () => {
    logar("manager");
    consulta.value = { isLoading: false, isError: true, data: undefined, refetch: vi.fn() };
    render(<ListaDeCampanhas />);
    expect(screen.getByText("Erro ao carregar as campanhas.")).toBeTruthy();
  });
});
