/**
 * A TELA DE TAREFAS ORGANIZADA — as peças de tela: a linha (atraso relativo,
 * vínculo legível, clique que abre o dossiê), os grupos recolhíveis com
 * contagem, a barra de filtros, a barra em lote (trava e confirmação), o lote
 * em blocos com a trava contra duplo clique e o dossiê aberto pela tarefa.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
/** O Desfazer: a ação fica guardada; só roda quando o teste a solta. */
const adiadas = vi.hoisted(() => [] as Array<() => Promise<unknown>>);
const chaves = vi.hoisted(() => new Set<string>());
const quadro = vi.hoisted(() => ({ atual: { data: undefined as unknown, isLoading: false, isError: false } }));
const dossies = vi.hoisted(() => [] as Array<{ lead: { id: string }; pipelineId: string; stageName: string }>);

vi.mock("@/lib/api/client", () => ({ apiClient: { post, get: vi.fn(), patch: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, warning: toastWarning, error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/ui/aviso-com-desfazer", async () => {
  const { useSyncExternalStore } = await import("react");
  const ouvintes = new Set<() => void>();
  const avisar = () => ouvintes.forEach((o) => o());
  const assinar = (o: () => void) => {
    ouvintes.add(o);
    return () => void ouvintes.delete(o);
  };
  return {
    adiarAcao: (_m: unknown, _r: unknown, executar: () => Promise<unknown>, _d?: () => void, o: { chave?: string } = {}) => {
      if (o.chave) chaves.add(o.chave);
      avisar();
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
vi.mock("@/hooks/kanban/useBoard", () => ({ useBoard: () => quadro.atual }));
vi.mock("@/components/kanban/LeadDossier", () => ({
  LeadDossier: (p: { lead: { id: string }; pipelineId: string; stageName: string }) => {
    dossies.push(p);
    return <div data-testid="dossie">{p.lead.id}</div>;
  },
}));

import { ListaOrganizada } from "@/app/app/tasks/_components/ListaOrganizada";
import { BarraDeFiltrosDasTarefas } from "@/components/tarefas/BarraDeFiltrosDasTarefas";
import { BarraEmLoteDeTarefas } from "@/components/tarefas/BarraEmLoteDeTarefas";
import { DossieDaTarefa } from "@/components/tarefas/DossieDaTarefa";
import { LinhaDeTarefa } from "@/components/tarefas/LinhaDeTarefa";
import { blocosDoLote, useLoteDeTarefas } from "@/hooks/tasks/useLoteDeTarefas";
import type { Tarefa } from "@/lib/tarefas/tipos";

const AGORA = new Date(2026, 9, 22, 10, 0, 0);
const DIA = 86_400_000;
const EU = "11111111-1111-4111-8111-111111111111";
const FUNIL = "33333333-3333-4333-8333-333333333333";

let n = 0;
function tarefa(p: Partial<Tarefa>): Tarefa {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    organization_id: "org",
    title: `Tarefa ${n}`,
    description: null,
    due_date: null,
    priority: "medium",
    status: "pending",
    lead_id: null,
    contact_id: null,
    demanda_id: null,
    assigned_to: EU,
    created_by: EU,
    created_at: AGORA.toISOString(),
    updated_at: AGORA.toISOString(),
    ...p,
  };
}

const deNegocio = tarefa({
  title: "Enviar a proposta",
  due_date: new Date(AGORA.getTime() - 16 * DIA).toISOString(),
  lead_id: "lead-1",
  lead: { id: "lead-1", title: "Padaria", pipeline_id: FUNIL, stage_id: null, funil: { id: FUNIL, name: "Vendas" }, etapa: null },
});
const doContato = tarefa({ title: "Mandar catálogo", contact_id: "c-1", contato: { id: "c-1", display_name: "Carla" } });
const encerrada = tarefa({ title: "Separar fotos", status: "done", due_date: new Date(AGORA.getTime() - DIA).toISOString() });

const nada = async () => undefined;
const basicas = {
  podeEditar: true,
  aoAlternarConcluida: nada,
  aoEditar: () => undefined,
  aoApagar: nada,
};

function comQuery(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  adiadas.splice(0);
  chaves.clear();
  dossies.splice(0);
});

describe("linha de tarefa", () => {
  it("⭐ atrasada diz HÁ QUANTO TEMPO; a do futuro não (controle)", () => {
    render(<LinhaDeTarefa {...basicas} tarefa={deNegocio} agora={AGORA} nomeDoResponsavel="Eu" />);
    expect(screen.getByText(/Atrasada há 16 dias/)).toBeTruthy();
    const futura = tarefa({ title: "Futura", due_date: new Date(AGORA.getTime() + DIA).toISOString() });
    render(<LinhaDeTarefa {...basicas} tarefa={futura} agora={AGORA} nomeDoResponsavel="Eu" />);
    expect(screen.getAllByText(/Atrasada há/)).toHaveLength(1);
  });

  it("⭐ vínculo legível: 'Lead: Nome · Funil' e 'Contato: Nome'", () => {
    render(
      <>
        <LinhaDeTarefa {...basicas} tarefa={deNegocio} mostrarVinculo agora={AGORA} nomeDoResponsavel={null} />
        <LinhaDeTarefa {...basicas} tarefa={doContato} mostrarVinculo agora={AGORA} nomeDoResponsavel={null} />
      </>,
    );
    expect(screen.getByRole("link", { name: /Lead: Padaria · Vendas/ }).getAttribute("href")).toBe("/app/leads/lead-1");
    expect(screen.getByText("Contato: Carla")).toBeTruthy();
  });

  it("⭐ clicar no título e no vínculo abre (o dossiê), sem navegar", () => {
    const aoAbrir = vi.fn();
    render(<LinhaDeTarefa {...basicas} tarefa={deNegocio} mostrarVinculo aoAbrir={aoAbrir} agora={AGORA} nomeDoResponsavel={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar a proposta" }));
    const clique = fireEvent.click(screen.getByRole("link", { name: /Lead: Padaria/ }));
    expect(aoAbrir).toHaveBeenCalledTimes(2);
    expect(clique).toBe(false); // preventDefault: não saiu da tela
  });

  it("ações rápidas só existem com permissão (controle: somente leitura não as tem)", () => {
    const { unmount } = render(
      <LinhaDeTarefa {...basicas} tarefa={deNegocio} agora={AGORA} nomeDoResponsavel="Eu" usuarioId={EU} aoAdiar={nada} aoReatribuir={nada} aoMudarPrioridade={nada} />,
    );
    expect(screen.getByRole("button", { name: "Adiar a tarefa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Trocar o responsável" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mudar a prioridade" })).toBeTruthy();
    unmount();
    render(
      <LinhaDeTarefa {...basicas} podeEditar={false} tarefa={deNegocio} agora={AGORA} nomeDoResponsavel="Eu" usuarioId={EU} aoAdiar={nada} aoReatribuir={nada} aoMudarPrioridade={nada} />,
    );
    expect(screen.queryByRole("button", { name: "Adiar a tarefa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Trocar o responsável" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apagar a tarefa" })).toBeNull();
  });

  it("encerrada não oferece adiar", () => {
    render(<LinhaDeTarefa {...basicas} tarefa={encerrada} agora={AGORA} nomeDoResponsavel="Eu" aoAdiar={nada} />);
    expect(screen.queryByRole("button", { name: "Adiar a tarefa" })).toBeNull();
  });
});

describe("lista organizada", () => {
  const props = {
    ...basicas,
    ordem: "prazo" as const,
    agora: AGORA,
    usuarioId: EU,
    selecionadas: new Set<string>(),
    aoSelecionarGrupo: vi.fn(),
    nomeDoResponsavel: () => "Eu",
    nomeDe: (id: string) => id,
    aoSelecionar: vi.fn(),
  };

  it("⭐ grupos com contagem, e 'Encerradas' começa recolhido", () => {
    render(<ListaOrganizada {...props} agrupar="prazo" tarefas={[deNegocio, doContato, encerrada]} />);
    const atrasadas = screen.getByRole("button", { name: /Atrasadas/ });
    expect(atrasadas.getAttribute("aria-expanded")).toBe("true");
    expect(within(atrasadas).getByText("1")).toBeTruthy();
    const encerradas = screen.getByRole("button", { name: /Encerradas/ });
    expect(encerradas.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Separar fotos")).toBeNull();
    fireEvent.click(encerradas);
    expect(screen.getByText("Separar fotos")).toBeTruthy();
    // Recolher de novo esconde (controle: o clique alterna, não só abre).
    fireEvent.click(screen.getByRole("button", { name: /Atrasadas/ }));
    expect(screen.queryByText("Enviar a proposta")).toBeNull();
  });

  it("a caixa do grupo marca todas as dele", () => {
    render(<ListaOrganizada {...props} agrupar="prazo" tarefas={[deNegocio, doContato]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todas de Sem prazo" }));
    expect(props.aoSelecionarGrupo).toHaveBeenCalledWith([doContato.id], true);
  });

  it("agrupar por responsável: 'Sem responsável' é um grupo", () => {
    const semDono = tarefa({ title: "Sem dono", assigned_to: null });
    render(<ListaOrganizada {...props} agrupar="responsavel" tarefas={[deNegocio, semDono]} />);
    expect(screen.getByRole("button", { name: /^Eu/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sem responsável/ })).toBeTruthy();
  });

  it("recorte vazio diz o que fazer", () => {
    render(<ListaOrganizada {...props} agrupar="prazo" tarefas={[]} />);
    expect(screen.getByText("Nenhuma tarefa neste recorte")).toBeTruthy();
  });
});

describe("barra de filtros", () => {
  it("⭐ atalhos com contagem ligam o filtro; a contagem aparece", () => {
    const onChange = vi.fn();
    render(
      <BarraDeFiltrosDasTarefas
        filtros={{}}
        onChange={onChange}
        contagens={{ atrasadas: 3, hoje: 5, semResponsavel: 2 }}
        totalDoRecorte={10}
        celular={false}
        painel={null}
        nomeDe={(id) => id}
        funis={[]}
      />,
    );
    const atrasadas = screen.getByRole("button", { name: /Atrasadas 3/ });
    expect(screen.getByRole("button", { name: /Hoje 5/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sem responsável 2/ })).toBeTruthy();
    fireEvent.click(atrasadas);
    expect(onChange).toHaveBeenCalledWith({ atrasadas: true });
  });

  it("chip de filtro ligado remove só o dele", () => {
    const onChange = vi.fn();
    render(
      <BarraDeFiltrosDasTarefas
        filtros={{ prioridades: ["urgent"], periodo: "hoje", minhas: true }}
        onChange={onChange}
        contagens={{ atrasadas: 0, hoje: 0, semResponsavel: 0 }}
        totalDoRecorte={0}
        celular={false}
        painel={null}
        nomeDe={(id) => id}
        funis={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Remover filtro Prioridade: Urgente/ }));
    expect(onChange).toHaveBeenCalledWith({ prioridades: undefined, periodo: "hoje", minhas: true });
  });
});

describe("barra em lote", () => {
  const props = {
    membros: [],
    usuarioId: EU,
    podeEditar: true,
    onConcluir: vi.fn(),
    onAdiar: vi.fn(),
    onReatribuir: vi.fn(),
    onPrioridade: vi.fn(),
    onLimpar: vi.fn(),
  };

  it("⭐ travada enquanto há ação em curso (controle: livre, o Concluir chama)", () => {
    const { rerender } = render(<BarraEmLoteDeTarefas {...props} quantidade={2} ocupado onApagar={async () => true} />);
    expect((screen.getByRole("button", { name: "Concluir" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Apagar" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<BarraEmLoteDeTarefas {...props} quantidade={2} ocupado={false} onApagar={async () => true} />);
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onConcluir).toHaveBeenCalledTimes(1);
  });

  it("⭐ apagar só depois da confirmação", async () => {
    const onApagar = vi.fn(async () => true);
    render(<BarraEmLoteDeTarefas {...props} quantidade={3} ocupado={false} onApagar={onApagar} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(onApagar).not.toHaveBeenCalled();
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("Apagar 3 tarefas?")).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Apagar" }));
    });
    expect(onApagar).toHaveBeenCalledTimes(1);
  });

  it("Esc limpa a seleção; sem seleção a barra some", () => {
    const { rerender } = render(<BarraEmLoteDeTarefas {...props} quantidade={1} ocupado={false} onApagar={async () => true} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onLimpar).toHaveBeenCalled();
    rerender(<BarraEmLoteDeTarefas {...props} quantidade={0} ocupado={false} onApagar={async () => true} />);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});

describe("lote: trava e blocos", () => {
  const ids = (q: number) => Array.from({ length: q }, (_, i) => `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`);

  it("blocos de 50, mantendo a ação", () => {
    const blocos = blocosDoLote({ action: "priority", task_ids: ids(120), priority: "high" });
    expect(blocos.map((b) => (b.action === "priority" ? b.task_ids.length : 0))).toEqual([50, 50, 20]);
    expect(blocos.every((b) => b.action === "priority" && b.priority === "high")).toBe(true);
  });

  it("⭐ o duplo clique não agenda duas vezes; nada sai antes do fim do Desfazer", async () => {
    post.mockResolvedValue({ data: { feitas: 50, ignoradas: [] } });
    const { result } = renderHook(() => useLoteDeTarefas(), { wrapper: ({ children }) => comQuery(children) });
    let primeiro = false;
    let segundo = true;
    act(() => {
      primeiro = result.current.agendar("Concluindo", { action: "complete", task_ids: ids(120) }, (q) => `${q} feitas`);
    });
    act(() => {
      segundo = result.current.agendar("Concluindo", { action: "complete", task_ids: ids(120) }, (q) => `${q} feitas`);
    });
    expect(primeiro).toBe(true);
    expect(segundo).toBe(false);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(result.current.ocupado).toBe(true);
    expect(post).not.toHaveBeenCalled();
    await act(async () => {
      await adiadas[0]!();
    });
    expect(post).toHaveBeenCalledTimes(3);
    expect(toastSuccess).toHaveBeenCalledWith("150 feitas");
    expect(result.current.ocupado).toBe(false);
  });

  it("ids ignorados pela rota viram aviso, não sucesso calado", async () => {
    post.mockResolvedValue({ data: { feitas: 1, ignoradas: ["x"] } });
    const { result } = renderHook(() => useLoteDeTarefas(), { wrapper: ({ children }) => comQuery(children) });
    await act(async () => {
      await result.current.apagar(ids(2), (q) => `${q} apagadas`);
    });
    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining("1 apagadas 1"));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("dossiê pela tarefa", () => {
  const lead = { id: "lead-1", stage_id: "etapa-1" };
  const dados = { leads: [lead], stages: [{ id: "etapa-1", name: "Proposta", is_archived: false }], pipeline: { settings: null } };

  it("⭐ abre o LeadDossier do negócio, no funil dele, com o nome da etapa", () => {
    quadro.atual = { data: dados, isLoading: false, isError: false };
    render(comQuery(<DossieDaTarefa leadId="lead-1" pipelineId={FUNIL} ownerNames={new Map()} onFechar={vi.fn()} />));
    expect(screen.getByTestId("dossie").textContent).toBe("lead-1");
    expect(dossies.at(-1)).toMatchObject({ pipelineId: FUNIL, stageName: "Proposta" });
  });

  it("negócio que não está mais no funil fecha com aviso (controle: não monta painel vazio)", () => {
    quadro.atual = { data: dados, isLoading: false, isError: false };
    const onFechar = vi.fn();
    render(comQuery(<DossieDaTarefa leadId="sumiu" pipelineId={FUNIL} ownerNames={new Map()} onFechar={onFechar} />));
    expect(screen.queryByTestId("dossie")).toBeNull();
    expect(onFechar).toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalled();
  });

  it("carregando não fecha nem avisa", () => {
    quadro.atual = { data: undefined, isLoading: true, isError: false };
    const onFechar = vi.fn();
    render(comQuery(<DossieDaTarefa leadId="lead-1" pipelineId={FUNIL} ownerNames={new Map()} onFechar={onFechar} />));
    expect(onFechar).not.toHaveBeenCalled();
  });
});
