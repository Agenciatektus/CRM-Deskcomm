/**
 * O CARD DO LEAD na tela — as duas densidades, os vazios honestos e o seletor
 * de densidade lembrado por pessoa (com a cerca de hidratação).
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { ptBR } from "date-fns/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => ptBR }));
vi.mock("@/components/kanban/KanbanCardActions", () => ({ KanbanCardActions: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));
vi.mock("@hello-pangea/dnd", () => ({
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => {}, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

import { KanbanCard } from "@/components/kanban/KanbanCard";
import { SeletorDeDensidade } from "@/components/kanban/SeletorDeDensidade";
import { CHAVE_DO_FUNIL_COMPACTO, useFunilCompacto } from "@/hooks/kanban/useFunilCompacto";
import { buildCardInput } from "@/lib/kanban/card-state";
import type { Lead } from "@/lib/types/leads";

const AGORA = new Date();
const lead = (over: Partial<Lead> = {}): Lead =>
  ({
    id: "lead-1",
    contact_id: "contato-1",
    title: "Novo contato pelo WhatsApp",
    value_cents: null,
    currency: "BRL",
    tags: ["Cozinha planejada", "Indicação", "Retorno"],
    stage_changed_at: new Date(AGORA.getTime() - 3 * 86_400_000).toISOString(),
    created_at: AGORA.toISOString(),
    owner_kind: null,
    owner_user_id: null,
    owner_agent_id: null,
    next_action: null,
    score: null,
    source: "instagram",
    conversa: {
      id: "conv-1",
      preview: "Vi o reels da cozinha, quanto fica?",
      last_message_at: AGORA.toISOString(),
      unread: 2,
      instagram_entrada: "direct",
    },
    contact_instagram: "carol.decor",
    proximo_passo: null,
    ...over,
  }) as Lead;

function desenhar(l: Lead, compacto = false, limiteDaEtapa: number | null = null) {
  const card = buildCardInput(l, { stageName: "Novo", ownerNames: new Map() });
  return render(
    <KanbanCard card={card} lead={l} index={0} pipelineId="p-1" compacto={compacto} limiteDaEtapa={limiteDaEtapa} />,
  );
}

afterEach(cleanup);

describe("card do lead — confortável e compacto", () => {
  it("⭐ Direct sem nome mostra o @, o selo do Instagram e nunca o título genérico", () => {
    desenhar(lead());
    expect(screen.getByRole("button", { name: "@carol.decor" })).toBeInTheDocument();
    expect(screen.queryByText("Novo contato pelo WhatsApp")).toBeNull();
    expect(screen.getByRole("img", { name: "Origem: Direct do Instagram" })).toBeInTheDocument();
    expect(screen.getByLabelText("2 mensagens não lidas")).toBeInTheDocument();
  });

  it("confortável: última mensagem e 2 etiquetas + '+N'; vazios tracejados; sem traço de valor", () => {
    const { container } = desenhar(lead());
    expect(screen.getByText("Vi o reels da cozinha, quanto fica?")).toBeInTheDocument();
    expect(screen.getByText("Cozinha planejada")).toBeInTheDocument();
    expect(screen.getByText("+1")).toHaveAttribute("title", "Retorno");
    expect(screen.getByText("Sem próximo passo")).toBeInTheDocument();
    expect(screen.getByText("Sem responsável")).toBeInTheDocument();
    expect(container.textContent).not.toContain("—");
    expect(screen.getByText("há 3 dias")).toBeInTheDocument();
  });

  it("⭐ compacto: some a última mensagem e as etiquetas; o resto fica", () => {
    desenhar(lead(), true);
    expect(screen.queryByText("Vi o reels da cozinha, quanto fica?")).toBeNull();
    expect(screen.queryByText("Cozinha planejada")).toBeNull();
    expect(screen.getByText("Sem próximo passo")).toBeInTheDocument();
    expect(screen.getByRole("group")).toHaveAttribute("data-densidade", "compacta");
  });

  it("valor só quando existe; tarefa atrasada em destaque; parado acima do limite", () => {
    desenhar(
      lead({
        value_cents: 1_235_000,
        proximo_passo: { titulo: "Ligar para confirmar", prazo: new Date(AGORA.getTime() - 2.5 * 86_400_000).toISOString() },
      }),
      false,
      48,
    );
    expect(screen.getByText(/12\.350/)).toBeInTheDocument();
    expect(screen.getByText("Atrasada 2 dias")).toBeInTheDocument();
    expect(screen.getByText("Parado há 3 dias")).toBeInTheDocument();
  });

  it("⭐ foto do contato por <img> da rota própria; sem foto, iniciais", () => {
    const { container, unmount } = desenhar(lead({ contact_tem_foto: true }));
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/contacts/contato-1/avatar");
    unmount();
    const semFoto = desenhar(lead({ contact_name: "Roberto Lima", contact_instagram: undefined }));
    expect(semFoto.container.querySelector("img")).toBeNull();
    expect(screen.getByText("RL")).toBeInTheDocument();
  });

  it("responsável: primeiro nome, nome completo no título", () => {
    const l = lead({ owner_kind: "user", owner_user_id: "u-1" });
    const card = buildCardInput(l, { stageName: "Novo", ownerNames: new Map([["u-1", "Marcela de Souza"]]) });
    render(<KanbanCard card={card} lead={l} index={0} pipelineId="p-1" />);
    expect(screen.getByText("Marcela")).toBeInTheDocument();
    expect(screen.getByTitle("Responsável: Marcela de Souza")).toBeInTheDocument();
  });
});

describe("densidade lembrada por pessoa", () => {
  beforeEach(() => window.localStorage.clear());

  it("⭐ grava por usuário e volta no próximo render", () => {
    const { result } = renderHook(() => useFunilCompacto("u-1"));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(window.localStorage.getItem(CHAVE_DO_FUNIL_COMPACTO)).toBe("u-1:1");
    expect(result.current[0]).toBe(true);
    // Outra pessoa no mesmo navegador não herda a escolha.
    expect(renderHook(() => useFunilCompacto("u-2")).result.current[0]).toBe(false);
  });

  it("⭐ cerca de hidratação: o render do servidor não lê o navegador", () => {
    window.localStorage.setItem(CHAVE_DO_FUNIL_COMPACTO, "u-1:1");
    function Tela() {
      const [compacto] = useFunilCompacto("u-1");
      return <span>{compacto ? "compacto" : "confortavel"}</span>;
    }
    expect(renderToString(<Tela />)).toContain("confortavel");
  });

  it("seletor: dois botões nativos com aria-pressed", () => {
    const onChange = vi.fn();
    render(<SeletorDeDensidade compacto={false} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Confortável" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Compacto" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("o cabeçalho do Funil liga o seletor ao quadro", () => {
    const fonte = readFileSync("app/app/pipelines/[id]/_client.tsx", "utf8");
    expect(fonte).toMatch(/<SeletorDeDensidade compacto=\{compacto\} onChange=\{setCompacto\}/);
    expect(fonte).toMatch(/compacto=\{compacto\}\s*\/>/);
    expect(readFileSync("components/kanban/StageColumn.tsx", "utf8")).toMatch(
      /limiteDaEtapa=\{stage\.expected_duration_hours\}/,
    );
  });
});
