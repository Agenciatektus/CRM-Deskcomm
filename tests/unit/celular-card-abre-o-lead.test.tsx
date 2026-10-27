import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAVE_DA_VISTA } from "@/hooks/kanban/usePreferenciasDoFunil";

/**
 * NO CELULAR, TOCAR NO CARD ABRE O LEAD, e não recarrega a página.
 *
 * O card do Funil no celular (Lista e abas de etapa) era um link para
 * `/app/leads/:id`, que redireciona para `/app/pipelines/:funil?lead=:id`. A
 * versão de celular desta página não lia o `?lead=` nem tinha dossiê: cada
 * toque saía da página, passava pelo esqueleto de carregamento e voltava ao
 * MESMO funil, sem abrir nada (usuário agent da fiorotto-modas, 27/10/2026).
 *
 * Os testes montam a página de verdade (`PipelinePageClient`) e a casca do
 * celular de verdade (`FunilNoCelular`, `ListaDoFunilCelular`); o link é um
 * dublê que só "navega" quando ninguém chamou `preventDefault`.
 */
const estado = vi.hoisted(() => ({ busca: new URLSearchParams(), navegou: [] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: (u: string) => estado.navegou.push(u) }),
  usePathname: () => "/app/pipelines/p-1",
  useSearchParams: () => estado.busca,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...p }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) => (
    <a
      href={href}
      {...p}
      onClick={(e) => {
        onClick?.(e);
        // O `next/link` de verdade navega quando o clique não foi impedido.
        if (!e.isDefaultPrevented()) estado.navegou.push(href);
        e.preventDefault(); // o jsdom não navega; quem conta é o `navegou`
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/lib/mobile/useEhCelular", () => ({ useEhCelular: () => true }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ id: "u-1" }),
  useAuth: () => ({ user: { id: "u-1" } }),
  useActiveOrg: () => ({ orgId: "org-1", role: "agent" }),
  usePermission: () => false,
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
vi.mock("@/components/mobile/FunisDoMenu", () => ({ useFunisDoMenu: () => [] }));
vi.mock("@/hooks/kanban/useBoard", () => ({
  useBoard: () => ({
    data: {
      pipeline: { id: "p-1", name: "Pré-venda", vocabulary: null, settings: null },
      stages: [{ id: "s1", name: "Novo contato", position: 1, is_archived: false, expected_duration_hours: null }],
      leads: [
        { id: "l1", title: "A", status: "open", stage_id: "s1", position_in_stage: 1, contact_name: "Ana", created_at: new Date().toISOString(), stage_changed_at: null, tags: [], source: "manual", value_cents: null, owner_user_id: null, owner_agent_id: null, owner_kind: null },
      ],
    },
    isLoading: false,
    error: null,
    pulses: [],
    realtimeStatus: "SUBSCRIBED",
    seguranca: { divergencias: 0, ultimaVerificacao: null },
  }),
}));
vi.mock("@/components/kanban/barra/BarraDeBusca", () => ({ BarraDeBusca: () => null }));
vi.mock("@/components/kanban/barra/CabecalhoDoFunil", () => ({ CabecalhoDoFunil: () => null }));
vi.mock("@/components/kanban/barra/PainelDeFiltros", () => ({ PainelDeFiltros: () => null }));
vi.mock("@/components/kanban/NewLeadDialog", () => ({ NewLeadDialog: () => null }));
vi.mock("@/components/kanban/BulkActionBar", () => ({ BulkActionBar: () => null }));
vi.mock("@/components/mobile/telas/FolhaMoverEtapaDoLead", () => ({ FolhaMoverEtapaDoLead: () => null }));
vi.mock("@/components/kanban/LeadDossier", () => ({
  LeadDossier: ({ lead }: { lead: { id: string } }) => <div data-testid="dossie">{lead.id}</div>,
}));

async function montarPagina() {
  const { PipelinePageClient } = await import("@/app/app/pipelines/[id]/_client");
  render(<PipelinePageClient pipelineId="p-1" initialName="Pré-venda" role="agent" funis={[]} />);
}

function tocar(texto: string) {
  act(() => {
    fireEvent.click(screen.getByText(texto));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  estado.busca = new URLSearchParams();
  estado.navegou = [];
});

describe("Funil no celular: tocar no card abre o lead", () => {
  it("Lista: abre o dossiê na página e não sai para /app/leads", async () => {
    window.localStorage.setItem(CHAVE_DA_VISTA, "u-1:lista");
    await montarPagina();
    expect(screen.queryByTestId("dossie")).toBeNull();
    tocar("Ana");
    expect(estado.navegou).toEqual([]);
    expect(screen.getByTestId("dossie").textContent).toBe("l1");
  });

  it("abas de etapa: abre o dossiê na página e não sai para /app/leads", async () => {
    await montarPagina();
    tocar("Ana");
    expect(estado.navegou).toEqual([]);
    expect(screen.getByTestId("dossie").textContent).toBe("l1");
  });

  it("o destino do redirecionamento (`?lead=`) abre o dossiê no celular", async () => {
    estado.busca = new URLSearchParams("lead=l1");
    await montarPagina();
    expect(screen.getByTestId("dossie").textContent).toBe("l1");
  });

  it("controle: sem `?lead=` e sem toque, nada abre", async () => {
    await montarPagina();
    expect(screen.queryByTestId("dossie")).toBeNull();
  });
});
