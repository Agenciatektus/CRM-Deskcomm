import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BulkActionBar } from "@/components/kanban/BulkActionBar";
import { responsavelDaTarefa } from "@/components/kanban/lote/TarefaEmLote";
import { celulaCsv, montarCsv } from "@/lib/kanban/csv-da-lista";
import { linhasDoCsv } from "@/lib/kanban/linhas-do-csv";
import { porNegocio, resumoDasFalhas } from "@/lib/kanban/lote-por-negocio";
import { bulkLeadActionSchema } from "@/lib/schemas/leads";
import type { Lead } from "@/lib/types/leads";

/**
 * Ações em lote do Funil (20/10/2026): levar para outro funil, remover etiqueta,
 * criar tarefa, reabrir, exportar CSV e marcar como ganho com confirmação.
 */
const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const mutate = vi.hoisted(() =>
  vi.fn((input: { lead_ids: string[] }, o: { onSuccess: (r: unknown) => void }) =>
    o.onSuccess({ data: { updated_count: input.lead_ids.length } }),
  ),
);
/** O Desfazer: a ação fica GUARDADA aqui; só roda quando o teste deixa o aviso acabar. */
const adiadas = vi.hoisted(() => [] as Array<() => Promise<unknown>>);
/** O Desfazer de cada ação guardada, na mesma ordem de `adiadas`. */
const desfazeres = vi.hoisted(() => [] as Array<() => void>);
/** As chaves seguradas nos 5 s (a trava do lote). */
const chaves = vi.hoisted(() => new Set<string>());
const toastWarning = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({ apiClient: { get, post, patch: vi.fn() } }));
vi.mock("@/lib/ui/aviso-com-desfazer", async () => {
  // Reativo como o de verdade: quem lê a chave re-renderiza quando ela muda.
  const { useSyncExternalStore } = await import("react");
  const ouvintes = new Set<() => void>();
  const avisar = () => ouvintes.forEach((o) => o());
  const assinar = (o: () => void) => {
    ouvintes.add(o);
    return () => void ouvintes.delete(o);
  };
  return {
    adiarAcao: (
      _m: unknown,
      _r: unknown,
      executar: () => Promise<unknown>,
      aoDesfazer?: () => void,
      o: { chave?: string } = {},
    ) => {
      if (o.chave) chaves.add(o.chave);
      avisar();
      desfazeres.push(() => {
        if (o.chave) chaves.delete(o.chave);
        adiadas.splice(0);
        avisar();
        aoDesfazer?.();
      });
      adiadas.push(async () => {
        if (o.chave) chaves.delete(o.chave);
        avisar();
        return executar();
      });
    },
    useAcaoPendente: (c: string) => useSyncExternalStore(assinar, () => chaves.has(c), () => false),
    acaoPendente: (c: string) => chaves.has(c),
  };
});
vi.mock("@/hooks/kanban/useBulkAction", () => ({
  useBulkAction: () => ({ mutate, mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: toastWarning, error: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ id: "eu", is_platform_admin: false }),
  useActiveOrg: () => ({ role: "agent" }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
vi.mock("@/hooks/kanban/useMotivosDePerdaDoFunil", () => ({ useMotivosDePerdaDoFunil: () => [] }));
vi.mock("@/hooks/kanban/useUpdateLead", () => ({ useLoseLead: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
// O formulário do painel é o mesmo da Inbox (medido lá); aqui só o pedido que ele entrega.
vi.mock("@/components/inbox/painel/NovaTarefaRapida", () => ({
  NovaTarefaRapida: ({ onCriar, opcaoDoDono }: { onCriar: (p: unknown) => void; opcaoDoDono?: string }) => (
    <button type="button" onClick={() => onCriar({ title: "Ligar", due_date: "2026-10-21T12:00:00.000Z", assigned_to: "" })}>
      {`criar (${opcaoDoDono})`}
    </button>
  ),
}));

const STAGES = [
  { id: "s1", name: "Novo", is_won: false, is_lost: false, expected_duration_hours: null },
  { id: "g", name: "Ganho", is_won: true, is_lost: false },
  { id: "p", name: "Perdido", is_won: false, is_lost: true },
] as never;

const lead = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    stage_id: "s1",
    status: "open",
    owner_user_id: null,
    contact_id: `c-${id}`,
    tags: [],
    created_at: "2026-10-01T00:00:00Z",
    stage_changed_at: "2026-10-01T00:00:00Z",
    ...extra,
  }) as unknown as Lead;

const DOIS_FUNIS = [
  { id: "p-1", name: "Vendas" },
  { id: "p-2", name: "Pós-venda" },
];

let onRestaurar = vi.fn();

function montar(selectedIds: string[], leads: Lead[], funis = DOIS_FUNIS) {
  const onClear = vi.fn();
  onRestaurar = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BulkActionBar
        selectedIds={selectedIds}
        stages={STAGES}
        pipelineId="p-1"
        tagsExistentes={[]}
        leads={leads}
        funis={funis}
        ownerNames={new Map()}
        onClear={onClear}
        onRestaurar={onRestaurar}
      />
    </QueryClientProvider>,
  );
  return onClear;
}

const soltarOAviso = async () => {
  for (const executar of adiadas.splice(0)) await executar();
};

const abrirMais = () => userEvent.click(screen.getByRole("button", { name: "Mais ações…" }));

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: {} });
  get.mockReset();
  get.mockResolvedValue({ data: { stages: [{ id: "d1", name: "Onboarding" }] } });
  mutate.mockClear();
  toastWarning.mockReset();
  adiadas.splice(0);
  desfazeres.splice(0);
  chaves.clear();
});

describe("marcar como ganho em lote (decisão do Peterson: confirmação + Desfazer de 5 s)", () => {
  it("nada sai antes da confirmação NEM antes do fim do Desfazer; depois, um /win por negócio", async () => {
    const onClear = montar(
      ["a", "b", "c", "d"],
      [lead("a"), lead("b"), lead("c", { status: "won" }), lead("d", { status: "lost" })],
    );
    await abrirMais();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Marcar como ganho…" }));

    const alerta = await screen.findByRole("alertdialog");
    expect(alerta.textContent).toContain("2 negócios");
    // Só os ABERTOS: o ganho e o perdido ficam de fora, contados no aviso.
    expect(alerta.textContent).toContain("2 ignorados por já estarem encerrados; use Reabrir.");
    expect(alerta.textContent).toContain("evento de venda (conversão)");
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(within(alerta).getByRole("button", { name: "Marcar como ganho" }));
    // Confirmado, mas o aviso de Desfazer ainda corre: nada externo saiu.
    expect(adiadas).toHaveLength(1);
    expect(post).not.toHaveBeenCalled();

    await soltarOAviso();
    expect(post.mock.calls.map((c) => c[0]).sort()).toEqual(["/api/v1/leads/a/win", "/api/v1/leads/b/win"]);
    expect(onClear).toHaveBeenCalled();
  });

  it("controle negativo: cancelar a confirmação não agenda nada", async () => {
    montar(["a"], [lead("a")]);
    await abrirMais();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Marcar como ganho…" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    expect(adiadas).toHaveLength(0);
    expect(post).not.toHaveBeenCalled();
  });

  it("quem falha é reportado (quantos e por quê) e quem ganhou fica", async () => {
    post.mockImplementation(async (url: string) => {
      if (url.includes("/b/")) throw new Error("Preencha o valor do negócio.");
      return { data: {} };
    });
    montar(["a", "b"], [lead("a"), lead("b")]);
    await abrirMais();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Marcar como ganho…" }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Marcar como ganho" }),
    );
    await soltarOAviso();
    expect(toastWarning).toHaveBeenCalledWith("1 marcado como ganho. 1 não foi: 1× Preencha o valor do negócio.");
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe("levar para outro funil em lote", () => {
  it("cada negócio vai pela /clone com o MESMO id; nenhum lead novo é criado", async () => {
    montar(["a", "b"], [lead("a"), lead("b")]);
    await abrirMais();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Levar para outro funil…" }));
    const caixa = await screen.findByRole("dialog");
    const [funil] = Array.from(document.querySelectorAll("select"));
    fireEvent.change(funil!, { target: { value: "p-2" } });
    await userEvent.click(within(caixa).getByRole("button", { name: "Confirmar" }));
    expect(post).not.toHaveBeenCalled();

    await soltarOAviso();
    const urls = post.mock.calls.map((c) => c[0]).sort();
    expect(urls).toEqual(["/api/v1/leads/a/clone", "/api/v1/leads/b/clone"]);
    expect(post.mock.calls[0]![1]).toEqual({ pipeline_id: "p-2", rodar_automacoes_de_entrada: false });
    // Controle negativo: nem criação (`POST /leads`) nem retomada (negócio novo).
    expect(urls.some((u) => u === "/api/v1/leads" || u.includes("/retomar"))).toBe(false);
  });

  it("um funil só não oferece a ação", async () => {
    montar(["a"], [lead("a")], [{ id: "p-1", name: "Vendas" }]);
    await abrirMais();
    await screen.findByRole("menuitem", { name: "Exportar CSV" });
    expect(screen.queryByRole("menuitem", { name: "Levar para outro funil…" })).not.toBeInTheDocument();
  });
});

describe("tarefa em lote (o mesmo POST /tasks do painel)", () => {
  it("uma tarefa por negócio, presa a ele; responsável padrão = o dono de cada um, ou eu", async () => {
    montar(["a", "b"], [lead("a", { owner_user_id: "dono-a" }), lead("b")]);
    await abrirMais();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Definir próximo passo…" }));
    await userEvent.click(await screen.findByRole("button", { name: "criar (Responsável de cada negócio)" }));
    expect(post).not.toHaveBeenCalled();
    await soltarOAviso();
    const corpos = post.mock.calls.filter((c) => c[0] === "/api/v1/tasks").map((c) => c[1]);
    expect(corpos).toHaveLength(2);
    expect(corpos.find((c) => c.lead_id === "a")).toMatchObject({ assigned_to: "dono-a", contact_id: "c-a", title: "Ligar" });
    expect(corpos.find((c) => c.lead_id === "b")).toMatchObject({ assigned_to: "eu", contact_id: "c-b" });
  });

  it("reconfirmar nos 5 s não cria a tarefa de novo: a seleção sai e a barra trava", async () => {
    const onClear = montar(["a"], [lead("a")]);
    await abrirMais();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Definir próximo passo…" }));
    await userEvent.click(await screen.findByRole("button", { name: "criar (Responsável de cada negócio)" }));
    expect(onClear).toHaveBeenCalled();
    expect(adiadas).toHaveLength(1);
    // Controle negativo da trava: o "Mais ações" não abre de novo enquanto segura.
    expect(screen.getByRole("button", { name: "Mais ações…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
    await soltarOAviso();
    expect(post.mock.calls.filter((c) => c[0] === "/api/v1/tasks")).toHaveLength(1);
  });

  it("a barra segue travada enquanto as chamadas negócio a negócio saem", async () => {
    let liberar: () => void = () => undefined;
    post.mockImplementation(() => new Promise<void>((r) => (liberar = r)));
    montar(["a"], [lead("a")]);
    await abrirMais();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Definir próximo passo…" }));
    await userEvent.click(await screen.findByRole("button", { name: "criar (Responsável de cada negócio)" }));
    const rodando = soltarOAviso();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Mais ações…" })).toBeDisabled();
    liberar();
    await rodando;
    await waitFor(() => expect(screen.getByRole("button", { name: "Mais ações…" })).toBeEnabled());
  });

  it("⭐ Desfazer devolve a seleção que o agendamento limpou, e nada é criado", async () => {
    const onClear = montar(["a", "b"], [lead("a"), lead("b")]);
    await abrirMais();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Definir próximo passo…" }));
    await userEvent.click(await screen.findByRole("button", { name: "criar (Responsável de cada negócio)" }));
    expect(onClear).toHaveBeenCalled();
    // Controle negativo: só agendar não devolve nada.
    expect(onRestaurar).not.toHaveBeenCalled();
    desfazeres[0]!();
    expect(onRestaurar).toHaveBeenCalledWith(["a", "b"]);
    await soltarOAviso();
    expect(post.mock.calls.filter((c) => c[0] === "/api/v1/tasks")).toHaveLength(0);
  });

  it("⭐ recusada (outra ação do lote nos 5 s), avisa e não fecha calada", async () => {
    // Outra ação do lote já segura a chave deste funil NESTA aba (ex.: um ganho
    // em lote nos 5 s). A trava é estado do módulo, em memória: outra aba do
    // navegador tem a sua e NÃO a enxerga.
    chaves.add("lote-do-funil:p-1");
    const onClear = montar(["a"], [lead("a")]);
    // A barra está travada; o diálogo é aberto direto para medir a recusa.
    const { TarefaEmLote } = await import("@/components/kanban/lote/TarefaEmLote");
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TarefaEmLote
          open
          onOpenChange={onOpenChange}
          selectedIds={["a"]}
          leads={[lead("a")]}
          usuarioId="eu"
          pipelineId="p-1"
          onConcluido={onClear}
          onDesfeito={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "criar (Responsável de cada negócio)" }));
    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining("Já há uma ação em lote em curso"));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onClear).not.toHaveBeenCalled();
    expect(adiadas).toHaveLength(0);
    // Controle negativo: sem a chave segurada, o mesmo clique agenda e fecha.
    chaves.clear();
    await userEvent.click(screen.getAllByRole("button", { name: "criar (Responsável de cada negócio)" }).at(-1)!);
    expect(adiadas).toHaveLength(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("responsável escolhido vence o dono", () => {
    expect(responsavelDaTarefa("m1", { owner_user_id: "dono" }, "eu")).toBe("m1");
    expect(responsavelDaTarefa("", undefined, "eu")).toBe("eu");
  });
});

describe("remover etiqueta e reabrir (pela rota em lote, com Desfazer)", () => {
  it("o menu de tag lista as etiquetas dos selecionados e remove pela ação `tag`", async () => {
    montar(["a"], [lead("a", { tags: ["vip"] })]);
    await userEvent.click(screen.getByRole("button", { name: "Tag…" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "vip" }));
    await soltarOAviso();
    expect(mutate.mock.calls[0]![0]).toEqual({ action: "tag", lead_ids: ["a"], params: { remove: ["vip"] } });
  });

  it("⭐ as ações antigas da barra (rota em lote) também travam a barra nos 5 s", async () => {
    montar(["a"], [lead("a", { tags: ["vip"] })]);
    // Controle negativo: antes de agendar, Excluir está livre.
    expect(screen.getByRole("button", { name: "Excluir" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Tag…" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "vip" }));
    expect(chaves.has("lote-do-funil:p-1")).toBe(true);
    expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mais ações…" })).toBeDisabled();
    await soltarOAviso();
    await waitFor(() => expect(screen.getByRole("button", { name: "Excluir" })).toBeEnabled());
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("⭐ a trava cobre também a EXECUÇÃO da rota em lote, depois que o aviso acaba", async () => {
    // A rota em lote não passa por `useAcaoPorNegocio`: antes, a chave soltava
    // no fim dos 5 s e a barra ficava livre com os blocos ainda saindo.
    let responder: () => void = () => undefined;
    mutate.mockImplementationOnce((input: { lead_ids: string[] }, o: { onSuccess: (r: unknown) => void }) => {
      responder = () => o.onSuccess({ data: { updated_count: input.lead_ids.length } });
    });
    montar(["a"], [lead("a", { tags: ["vip"] })]);
    await userEvent.click(screen.getByRole("button", { name: "Tag…" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "vip" }));
    const rodando = soltarOAviso();
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    // A chave já soltou (o aviso acabou), e a barra continua travada.
    expect(chaves.has("lote-do-funil:p-1")).toBe(false);
    expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mais ações…" })).toBeDisabled();
    responder();
    await rodando;
    // Controle negativo: terminou a execução, a barra solta.
    await waitFor(() => expect(screen.getByRole("button", { name: "Excluir" })).toBeEnabled());
  });

  it("reabrir move SÓ os encerrados para a etapa aberta escolhida", async () => {
    montar(["a", "b"], [lead("a", { status: "won", stage_id: "g" }), lead("b")]);
    await abrirMais();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reabrir (1)" }));
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Novo" }));
    await soltarOAviso();
    expect(mutate.mock.calls[0]![0]).toEqual({ action: "move", lead_ids: ["a"], params: { stage_id: "s1" } });
  });

  it("controle negativo: sem encerrado selecionado não há Reabrir", async () => {
    montar(["b"], [lead("b")]);
    await abrirMais();
    await screen.findByRole("menuitem", { name: "Exportar CSV" });
    expect(screen.queryByRole("menuitem", { name: /Reabrir/ })).not.toBeInTheDocument();
  });

  it("a rota em lote aceita remover sem adicionar", () => {
    const r = bulkLeadActionSchema.safeParse({
      action: "tag",
      lead_ids: ["00000000-0000-4000-8000-000000000001"],
      params: { remove: ["vip"] },
    });
    expect(r.success).toBe(true);
  });
});

describe("CSV dos selecionados (no navegador, só o que está na tela)", () => {
  it("colunas da Lista, só os marcados, na ordem da tela", () => {
    const leads = [
      lead("x", { contact_name: "Ana", contact_phone: "+5511999", value_cents: 123456 }),
      lead("y", { contact_name: "Bia" }),
      lead("z", { contact_name: "Caio" }),
    ];
    const linhas = linhasDoCsv(leads, ["z", "x"], {
      stages: STAGES,
      ownerNames: new Map(),
      t: (s) => s,
      agora: new Date("2026-10-04T00:00:00Z"),
    });
    expect(linhas[0]).toEqual(["Nome", "Telefone", "Etapa", "Valor", "Responsável", "Próximo passo", "Parado há", "Origem"]);
    expect(linhas.slice(1).map((l) => l[0])).toEqual(["Ana", "Caio"]);
    expect(linhas[1]!.slice(1, 4)).toEqual(["+5511999", "Novo", "1234,56"]);
  });

  it("célula escapa separador/aspas e neutraliza fórmula (telefone fica)", () => {
    expect(celulaCsv('a;"b"')).toBe('"a;""b"""');
    expect(celulaCsv("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(celulaCsv("+5511")).toBe("+5511");
    expect(celulaCsv("+55 (11) 99999-0000")).toBe("+55 (11) 99999-0000");
    expect(celulaCsv("-3")).toBe("-3");
    // P1 do Cassio na #220: nome vindo do WhatsApp é controlado por terceiro.
    expect(celulaCsv("+1+HYPERLINK(\"http://x\")")).toBe("\"'+1+HYPERLINK(\"\"http://x\"\")\"");
    expect(celulaCsv("-1+cmd|' /C calc'!A0")).toBe("'-1+cmd|' /C calc'!A0");
    expect(celulaCsv("1 +SUM(A1)")).toBe("1 +SUM(A1)");
    expect(celulaCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(celulaCsv("\t=1")).toBe("'\t=1");
    expect(montarCsv([["a", 1]]).startsWith("﻿a;1")).toBe(true);
  });
});

describe("porNegocio", () => {
  it("falha de um não para os outros; o resumo agrupa os motivos", async () => {
    const r = await porNegocio(["1", "2", "3"], async (id) => {
      if (id !== "2") throw new Error("sem campo");
    });
    expect(r.feitos).toEqual(["2"]);
    expect(resumoDasFalhas(r.falhas)).toBe("2× sem campo");
  });
});
