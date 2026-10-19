import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListaDoFunil } from "@/components/kanban/ListaDoFunil";
import { ListaDoFunilCelular, TOQUE_LONGO_MS } from "@/components/kanban/ListaDoFunilCelular";
import { SeletorDeVista } from "@/components/kanban/SeletorDeDensidade";
import { CHAVE_DA_VISTA, useVistaDoFunil } from "@/hooks/kanban/usePreferenciasDoFunil";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));

const STAGES = [{ id: "s1", name: "Novo contato", position: 1, expected_duration_hours: 24 }] as Stage[];
const LEADS = [
  { id: "l1", title: "A", status: "open", stage_id: "s1", position_in_stage: 1, contact_name: "Ana", created_at: new Date().toISOString(), stage_changed_at: null, tags: [], source: "manual", value_cents: null, owner_user_id: null, owner_agent_id: null, owner_kind: null, proximo_passo: null },
  { id: "l2", title: "B", status: "open", stage_id: "s1", position_in_stage: 2, contact_name: "Bia", created_at: new Date().toISOString(), stage_changed_at: null, tags: [], source: "manual", value_cents: 1000, owner_user_id: null, owner_agent_id: null, owner_kind: null, proximo_passo: null },
] as unknown as Lead[];

afterEach(() => window.localStorage.clear());

describe("barra do Funil, a tela", () => {
  it("Kanban × Lista: só ícone, com nome acessível e aria-pressed", () => {
    const onChange = vi.fn();
    render(<SeletorDeVista vista="kanban" onChange={onChange} />);
    const lista = screen.getByRole("button", { name: "Lista" });
    expect(lista).toHaveAttribute("aria-pressed", "false");
    expect(lista.textContent).toBe("");
    fireEvent.click(lista);
    expect(onChange).toHaveBeenCalledWith("lista");
  });

  it("a vista lembrada é por pessoa e o 1º render é o padrão", () => {
    window.localStorage.setItem(CHAVE_DA_VISTA, "u-1:lista");
    function Tela({ id }: { id: string }) {
      const [vista] = useVistaDoFunil(id);
      return <span>{vista}</span>;
    }
    expect(renderToString(<Tela id="u-1" />)).toContain("kanban");
    render(<Tela id="u-1" />);
    expect(screen.getByText("lista")).toBeTruthy();
    render(<Tela id="u-2" />);
    expect(screen.getByText("kanban")).toBeTruthy();
  });

  it("Lista: cabeçalho com aria-sort, clique ordena, caixa seleciona", () => {
    const onSel = vi.fn();
    render(<ListaDoFunil leads={LEADS} stages={STAGES} ownerNames={new Map()} ordem="valor" selectedIds={[]} onSelectionChange={onSel} />);
    expect(screen.getByRole("columnheader", { name: /Valor/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: /Nome/ }));
    expect(screen.getByRole("columnheader", { name: /Nome/ })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: /Valor/ })).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar Bia" }));
    expect(onSel).toHaveBeenCalledWith(["l2"]);
  });

  it("Lista no celular: segurar o card entra na seleção", () => {
    vi.useFakeTimers();
    const onSel = vi.fn();
    render(<ListaDoFunilCelular leads={LEADS} stages={STAGES} ownerNames={new Map()} ordem="esperando" selectedIds={[]} onSelectionChange={onSel} />);
    const card = screen.getByText("Ana").closest("li")!;
    fireEvent.pointerDown(card);
    act(() => vi.advanceTimersByTime(TOQUE_LONGO_MS));
    expect(onSel).toHaveBeenCalledWith(["l1"]);
    vi.useRealTimers();
  });

  it("cercas: Cadências saiu da barra; o quadro lê a espera na MESMA leitura das conversas", () => {
    expect(readFileSync("app/app/pipelines/[id]/_client.tsx", "utf8")).not.toMatch(/CadenciasDoPipeline/);
    const rota = readFileSync("app/api/v1/pipelines/[id]/board/route.ts", "utf8");
    expect(rota).toMatch(/from\("conversations"\)\s*\.select\(\s*"[^"]*\bawaiting_since\b[^"]*\blast_outbound_at\b/);
    expect(rota).toMatch(/esperando_desde: esperandoDesdeDaConversa\(row\)/);
  });
});
