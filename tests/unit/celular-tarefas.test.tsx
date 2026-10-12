import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TarefasNoCelular } from "@/components/mobile/telas/Tarefas";
import { secoesDaLista } from "@/lib/mobile/tarefas-do-celular";
import type { Tarefa } from "@/lib/tarefas/tipos";

/**
 * M3.2: a aba Tarefas do celular. Lista (Todas e Minhas, Atrasadas/Hoje/Próximas,
 * concluir com um toque e Desfazer) e Agenda de 7 dias com ponto nos dias marcados.
 * O relógio é fixo (só o `Date`), para "hoje" e "atrasada" não dependerem da hora
 * em que a suíte roda.
 */

const EU = "u-eu";
const avisos = vi.hoisted(() => [] as { opcoes: Record<string, unknown> }[]);
vi.mock("sonner", () => ({
  toast: Object.assign((_m: unknown, opcoes: Record<string, unknown>) => avisos.push({ opcoes }), {
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useUser: () => ({ id: "u-eu" }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [{ user_id: "u-bruno", full_name: "Bruno Sales" }] }),
}));
vi.mock("@/lib/mobile/useOpcoesDeCriar", () => ({ useTelasVisiveis: () => new Set(["/app/agenda"]) }));
const recortes = vi.hoisted(() => [] as unknown[]);
vi.mock("@/hooks/agenda/useAgendamentos", () => ({
  useAgendamentos: (recorte: unknown) => {
    recortes.push(recorte);
    return {
      data: [
        { id: "a-1", titulo: "Consulta de retorno", comeca: "2026-10-13T09:00:00", termina: "2026-10-13T10:00:00", situacao: "confirmed", quemSeraAtendido: "Carlos" },
        { id: "a-2", titulo: "Cancelada", comeca: "2026-10-14T09:00:00", termina: "2026-10-14T10:00:00", situacao: "cancelled" },
      ],
    };
  },
}));

const tarefa = (id: string, title: string, due: string | null, assigned_to: string | null = EU): Tarefa =>
  ({ id, title, due_date: due, status: "pending", priority: "medium", assigned_to }) as unknown as Tarefa;

const TODAS = [
  tarefa("t-1", "Conferir o comprovante", "2026-10-12T10:30:00", "u-bruno"),
  tarefa("t-2", "Confirmar a consulta", "2026-10-12T17:00:00"),
  tarefa("t-3", "Ligar para a Renata", "2026-10-15T10:00:00", "u-bruno"),
];
const editar = vi.hoisted(() => vi.fn(async () => ({})));
const pedidos = vi.hoisted(() => [] as unknown[]);
vi.mock("@/hooks/tasks/useTasks", () => ({
  useTasks: (filtros: { responsavel?: string }) => {
    pedidos.push(filtros);
    const tarefas = filtros.responsavel === "eu" ? TODAS.filter((x) => x.assigned_to === "u-eu") : TODAS;
    return { tarefas, carregando: false, falhou: false, editarTarefa: editar };
  },
}));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 12, 14, 0));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  avisos.length = 0;
  pedidos.length = 0;
  editar.mockClear();
});

const tela = () => render(<TarefasNoCelular podeEditar aoAbrirTarefa={vi.fn()} />);

describe("secoesDaLista", () => {
  it("vencida hoje cedo é Atrasada (como o contador da aba); mais tarde hoje é Hoje; o resto é Próximas", () => {
    const secoes = secoesDaLista([...TODAS, tarefa("t-4", "Sem prazo", null)], new Date(2026, 9, 12, 14, 0));
    expect(secoes.map((s) => [s.secao, s.tarefas.map((x) => x.id)])).toEqual([
      ["atrasadas", ["t-1"]],
      ["hoje", ["t-2"]],
      ["proximas", ["t-3", "t-4"]],
    ]);
  });
});

describe("Tarefas no celular — Lista", () => {
  it("chips Todas e Minhas com o número de abertas; Minhas pede assigned_to=eu à rota", async () => {
    const user = userEvent.setup();
    tela();
    expect(pedidos).toContainEqual({ aberto: true, responsavel: "eu" });
    const todas = screen.getByRole("button", { name: /Todas/ });
    const minhas = screen.getByRole("button", { name: /Minhas/ });
    expect(todas).toHaveTextContent("3");
    expect(minhas).toHaveTextContent("1");
    expect(screen.getAllByTestId("cartao-da-tarefa")).toHaveLength(3);
    await user.click(minhas);
    expect(minhas).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("cartao-da-tarefa")).toHaveLength(1);
  });

  it("seções Atrasadas, Hoje e Próximas; quem é de outro aparece 'com Fulano'", () => {
    tela();
    expect(screen.getByRole("region", { name: "Atrasadas" })).toHaveTextContent("Conferir o comprovante");
    expect(screen.getByRole("region", { name: "Atrasadas" })).toHaveTextContent("com Bruno Sales");
    expect(screen.getByRole("region", { name: "Hoje" })).toHaveTextContent("Confirmar a consulta");
    expect(screen.getByRole("region", { name: "Próximas" })).toHaveTextContent("Ligar para a Renata");
  });

  it("⭐ concluir com um toque (check de 48px): vai para Concluídas, só grava quando o aviso acaba", async () => {
    const user = userEvent.setup();
    tela();
    const check = screen.getByRole("button", { name: "Concluir: Confirmar a consulta" });
    expect(check.className).toContain("size-12");
    await user.click(check);
    expect(within(screen.getByRole("region", { name: "Concluídas" })).getByText("Confirmar a consulta")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Hoje" })).not.toBeInTheDocument();
    expect(editar).not.toHaveBeenCalled();
    (avisos[0]!.opcoes.onAutoClose as () => void)();
    expect(editar).toHaveBeenCalledWith("t-2", { status: "done" });
  });

  it("Desfazer devolve a tarefa sem gravar nada", async () => {
    const user = userEvent.setup();
    tela();
    await user.click(screen.getByRole("button", { name: "Concluir: Confirmar a consulta" }));
    (avisos[0]!.opcoes.action as { onClick: () => void }).onClick();
    expect(await screen.findByRole("region", { name: "Hoje" })).toHaveTextContent("Confirmar a consulta");
    expect(screen.queryByRole("region", { name: "Concluídas" })).not.toBeInTheDocument();
    (avisos[0]!.opcoes.onAutoClose as () => void)();
    expect(editar).not.toHaveBeenCalled();
  });
});

describe("Tarefas no celular — Agenda", () => {
  it("7 dias a partir de hoje, ponto nos dias com tarefa ou compromisso; cancelado não conta", async () => {
    const user = userEvent.setup();
    tela();
    await user.click(screen.getByRole("tab", { name: "Agenda" }));
    const dias = within(screen.getByRole("group", { name: "Dias da semana" })).getAllByRole("button");
    expect(dias).toHaveLength(7);
    // Hoje (12), amanhã (13, compromisso) e quinta (15, tarefa). O 14 só tem o cancelado.
    expect(dias.map((d) => d.getAttribute("aria-label")!.endsWith("com compromissos"))).toEqual([true, true, false, true, false, false, false]);
    expect(recortes.at(-1)).toEqual({ de: new Date(2026, 9, 12).toISOString(), ate: new Date(2026, 9, 19).toISOString() });
    await user.click(dias[1]!);
    expect(screen.getByText("Consulta de retorno")).toBeInTheDocument();
    expect(screen.getByText("Compromisso")).toBeInTheDocument();
    await user.click(dias[2]!);
    expect(screen.getByText("Nada marcado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Novo compromisso" })).toHaveAttribute("href", "/app/agenda?criar=1");
  });
});
