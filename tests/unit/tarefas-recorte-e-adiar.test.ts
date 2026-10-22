/**
 * A TELA DE TAREFAS ORGANIZADA — a lógica pura do recorte (filtros na URL,
 * atalhos com contagem, ordem, agrupamento), do adiar com um clique, do atraso
 * relativo e do destino do clique (dossiê × edição).
 *
 * Cada filtro tem o CONTROLE NEGATIVO ao lado: a tarefa que não deveria passar
 * está na mesma lista e o teste exige que ela fique de fora. Um filtro que não
 * filtrasse nada daria verde num teste que só olhasse a que passa.
 */
import { describe, expect, it } from "vitest";

import { prazoAdiado } from "@/lib/tarefas/adiar";
import { atrasoRelativo } from "@/lib/tarefas/atraso";
import { idsDoLote, loteDeTarefasSchema } from "@/lib/tarefas/lote";
import {
  agrupaPorResponsavel,
  aplicarFiltros,
  comparadorDasTarefas,
  contagensDosAtalhos,
  destinoAoAbrir,
  filtrosDaUrl,
  filtrosParaUrl,
  funisDasTarefas,
  quantosNoPainel,
  SEM_RESPONSAVEL,
  type FiltrosDeTarefas,
} from "@/lib/tarefas/recorte";
import type { Tarefa } from "@/lib/tarefas/tipos";

// Quarta, 22/10/2026, 10:00 no fuso de quem roda.
const AGORA = new Date(2026, 9, 22, 10, 0, 0);
const HORA = 3_600_000;
const DIA = 24 * HORA;
const EU = "11111111-1111-4111-8111-111111111111";
const PEDRO = "22222222-2222-4222-8222-222222222222";
const FUNIL = "33333333-3333-4333-8333-333333333333";
const ETAPA = "44444444-4444-4444-8444-444444444444";
const OUTRO_FUNIL = "55555555-5555-4555-8555-555555555555";

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
    assigned_to: null,
    created_by: EU,
    created_at: new Date(AGORA.getTime() - n * HORA).toISOString(),
    updated_at: AGORA.toISOString(),
    ...p,
  };
}
const iso = (ms: number) => new Date(AGORA.getTime() + ms).toISOString();

const atrasadaMinha = tarefa({ title: "Ligar para a Joana", due_date: iso(-16 * DIA), assigned_to: EU, priority: "urgent" });
const hojeDoPedro = tarefa({
  title: "Enviar proposta",
  due_date: iso(3 * HORA),
  assigned_to: PEDRO,
  lead_id: "lead-1",
  lead: { id: "lead-1", title: "Padaria São João", pipeline_id: FUNIL, stage_id: ETAPA, funil: { id: FUNIL, name: "Vendas" }, etapa: { id: ETAPA, name: "Proposta" } },
});
const semDonoAmanha = tarefa({ title: "Mandar catálogo", due_date: iso(DIA), contact_id: "c-1", contato: { id: "c-1", display_name: "Carla Mendes" } });
const avulsaSemPrazo = tarefa({ title: "Revisar textos", priority: "low", assigned_to: EU });
const encerrada = tarefa({ title: "Separar fotos", due_date: iso(-2 * DIA), status: "done", assigned_to: EU });
const doOutroFunil = tarefa({
  title: "Confirmar entrega",
  due_date: iso(5 * DIA),
  assigned_to: PEDRO,
  lead_id: "lead-2",
  lead: { id: "lead-2", title: "Oficina", pipeline_id: OUTRO_FUNIL, stage_id: null, funil: { id: OUTRO_FUNIL, name: "Pós-venda" }, etapa: null },
});
const TODAS = [atrasadaMinha, hojeDoPedro, semDonoAmanha, avulsaSemPrazo, encerrada, doOutroFunil];
const ctx = { usuarioId: EU, agora: AGORA };
const titulos = (f: FiltrosDeTarefas) => aplicarFiltros(TODAS, f, ctx).map((x) => x.title).sort();

describe("filtros na URL", () => {
  it("ida e volta preservam tudo o que difere do padrão", () => {
    const f: FiltrosDeTarefas = {
      busca: "joana",
      minhas: true,
      atrasadas: true,
      hoje: true,
      semResponsavel: true,
      responsavel: PEDRO,
      prioridades: ["urgent", "high"],
      periodo: "proximos_7",
      vinculo: "negocio",
      funil: FUNIL,
      etapa: ETAPA,
      situacao: "done",
      ordem: "prioridade",
      agrupar: "responsavel",
    };
    expect(filtrosDaUrl(new URLSearchParams(filtrosParaUrl(f)))).toEqual(f);
  });

  it("o padrão não suja a URL (controle: situação em aberto, ordem por prazo)", () => {
    expect(filtrosParaUrl({ situacao: "aberto", ordem: "prazo", agrupar: "prazo" })).toBe("");
  });

  it("valor fora do vocabulário é ignorado, não quebra a tela", () => {
    const f = filtrosDaUrl(new URLSearchParams("prio=altissima,high&periodo=ontem&vinculo=x&resp=nao-e-uuid&situacao=apagada&funil=1"));
    expect(f).toEqual({ prioridades: ["high"] });
  });

  it("etapa sem funil é descartada", () => {
    expect(filtrosDaUrl(new URLSearchParams(`etapa=${ETAPA}`)).etapa).toBeUndefined();
  });
});

describe("cada filtro recorta (e o que não passa fica de fora)", () => {
  it("busca acha título, negócio e contato, sem acento nem caixa", () => {
    expect(titulos({ busca: "JOANA" })).toEqual(["Ligar para a Joana"]);
    expect(titulos({ busca: "padaria sao joao" })).toEqual(["Enviar proposta"]);
    expect(titulos({ busca: "carla" })).toEqual(["Mandar catálogo"]);
    expect(titulos({ busca: "nada-casa" })).toEqual([]);
  });

  it("Minhas = responsável sou eu", () => {
    expect(titulos({ minhas: true })).toEqual(["Ligar para a Joana", "Revisar textos", "Separar fotos"]);
  });

  it("Atrasadas = prazo vencido e ainda aberta (a encerrada vencida NÃO entra)", () => {
    expect(titulos({ atrasadas: true })).toEqual(["Ligar para a Joana"]);
  });

  it("Hoje = vence hoje", () => {
    expect(titulos({ hoje: true })).toEqual(["Enviar proposta"]);
  });

  it("Sem responsável = sem dono e aberta", () => {
    expect(titulos({ semResponsavel: true })).toEqual(["Mandar catálogo"]);
  });

  it("responsável no painel: eu, sem, e um colega", () => {
    expect(titulos({ responsavel: "eu" })).toEqual(["Ligar para a Joana", "Revisar textos", "Separar fotos"]);
    expect(titulos({ responsavel: "sem" })).toEqual(["Mandar catálogo"]);
    expect(titulos({ responsavel: PEDRO })).toEqual(["Confirmar entrega", "Enviar proposta"]);
  });

  it("prioridade (várias)", () => {
    expect(titulos({ prioridades: ["urgent", "low"] })).toEqual(["Ligar para a Joana", "Revisar textos"]);
  });

  it("período do prazo", () => {
    expect(titulos({ periodo: "vencidas" })).toEqual(["Ligar para a Joana"]);
    expect(titulos({ periodo: "hoje" })).toEqual(["Enviar proposta"]);
    expect(titulos({ periodo: "amanha" })).toEqual(["Mandar catálogo"]);
    expect(titulos({ periodo: "proximos_7" })).toEqual(["Confirmar entrega", "Enviar proposta", "Mandar catálogo"]);
    expect(titulos({ periodo: "sem_prazo" })).toEqual(["Revisar textos"]);
  });

  it("vínculo: de negócio, só de contato, avulsa", () => {
    expect(titulos({ vinculo: "negocio" })).toEqual(["Confirmar entrega", "Enviar proposta"]);
    expect(titulos({ vinculo: "contato" })).toEqual(["Mandar catálogo"]);
    expect(titulos({ vinculo: "avulsa" })).toEqual(["Ligar para a Joana", "Revisar textos", "Separar fotos"]);
  });

  it("funil e etapa", () => {
    expect(titulos({ funil: FUNIL })).toEqual(["Enviar proposta"]);
    expect(titulos({ funil: FUNIL, etapa: ETAPA })).toEqual(["Enviar proposta"]);
    expect(titulos({ funil: OUTRO_FUNIL, etapa: ETAPA })).toEqual([]);
  });

  it("filtros somam (E)", () => {
    expect(titulos({ minhas: true, atrasadas: true, prioridades: ["low"] })).toEqual([]);
  });
});

describe("contagens dos atalhos", () => {
  it("contam o recorte sem os atalhos, e o 'Minhas' entra", () => {
    expect(contagensDosAtalhos(TODAS, {}, ctx)).toEqual({ atrasadas: 1, hoje: 1, semResponsavel: 1 });
    // Ligar o próprio atalho não zera os outros números.
    expect(contagensDosAtalhos(TODAS, { atrasadas: true }, ctx)).toEqual({ atrasadas: 1, hoje: 1, semResponsavel: 1 });
    // Com "Minhas", "Hoje" (do Pedro) e "Sem responsável" vão a zero.
    expect(contagensDosAtalhos(TODAS, { minhas: true }, ctx)).toEqual({ atrasadas: 1, hoje: 0, semResponsavel: 0 });
  });

  it("o número do botão Filtros conta só o painel", () => {
    expect(quantosNoPainel({ minhas: true, busca: "x", ordem: "criacao" })).toBe(0);
    expect(quantosNoPainel({ responsavel: "eu", prioridades: ["high"], situacao: "done", funil: FUNIL, etapa: ETAPA })).toBe(4);
  });
});

describe("ordem dentro do grupo", () => {
  it("prazo: o mais cedo primeiro, sem prazo no fim", () => {
    const ordem = [avulsaSemPrazo, doOutroFunil, atrasadaMinha, hojeDoPedro].sort(comparadorDasTarefas("prazo"));
    expect(ordem.map((x) => x.title)).toEqual(["Ligar para a Joana", "Enviar proposta", "Confirmar entrega", "Revisar textos"]);
  });

  it("prioridade: urgente primeiro, empate pelo prazo", () => {
    const a = tarefa({ priority: "high", due_date: iso(5 * DIA), title: "A" });
    const b = tarefa({ priority: "high", due_date: iso(DIA), title: "B" });
    const ordem = [avulsaSemPrazo, a, b, atrasadaMinha].sort(comparadorDasTarefas("prioridade"));
    expect(ordem.map((x) => x.title)).toEqual(["Ligar para a Joana", "B", "A", "Revisar textos"]);
  });

  it("criação: a mais nova primeiro", () => {
    const ordem = [atrasadaMinha, doOutroFunil, hojeDoPedro].sort(comparadorDasTarefas("criacao"));
    // `created_at` = AGORA − n horas: a 1ª criada no arquivo é a mais NOVA.
    expect(ordem.map((x) => x.title)).toEqual(["Ligar para a Joana", "Enviar proposta", "Confirmar entrega"]);
  });
});

describe("agrupar por responsável", () => {
  it("eu primeiro, sem responsável por último", () => {
    const grupos = agrupaPorResponsavel(TODAS, EU, (id) => (id === PEDRO ? "Pedro" : id));
    expect(grupos.map((g) => g.chave)).toEqual([EU, PEDRO, SEM_RESPONSAVEL]);
    expect(grupos[2]!.tarefas.map((x) => x.title)).toEqual(["Mandar catálogo"]);
  });
});

describe("funis do painel", () => {
  it("só os que aparecem nas tarefas, com as etapas vistas", () => {
    expect(funisDasTarefas(TODAS)).toEqual([
      { id: OUTRO_FUNIL, name: "Pós-venda", etapas: [] },
      { id: FUNIL, name: "Vendas", etapas: [{ id: ETAPA, name: "Proposta" }] },
    ]);
  });
});

describe("adiar com um clique", () => {
  it("+1 h parte de AGORA quando o prazo já venceu (senão continuaria no passado)", () => {
    expect(prazoAdiado("uma_hora", iso(-16 * DIA), AGORA).getTime()).toBe(AGORA.getTime() + HORA);
  });

  it("+1 h parte do PRAZO quando ele ainda está no futuro", () => {
    expect(prazoAdiado("uma_hora", iso(3 * HORA), AGORA).getTime()).toBe(AGORA.getTime() + 4 * HORA);
  });

  it("amanhã mantém a hora do prazo; sem prazo, 9h", () => {
    const comHora = prazoAdiado("amanha", new Date(2026, 9, 20, 15, 30).toISOString(), AGORA);
    expect([comHora.getDate(), comHora.getHours(), comHora.getMinutes()]).toEqual([23, 15, 30]);
    const semPrazo = prazoAdiado("amanha", null, AGORA);
    expect([semPrazo.getDate(), semPrazo.getHours()]).toEqual([23, 9]);
  });

  it("próxima semana = a segunda que vem (e na segunda, a de daqui a 7 dias)", () => {
    const deQuarta = prazoAdiado("proxima_semana", null, AGORA);
    expect([deQuarta.getDay(), deQuarta.getDate(), deQuarta.getHours()]).toEqual([1, 26, 9]);
    const segunda = new Date(2026, 9, 26, 8, 0);
    const deSegunda = prazoAdiado("proxima_semana", null, segunda);
    expect([deSegunda.getDay(), deSegunda.getDate()]).toEqual([1, 2]);
  });

  it("o resultado nunca está no passado", () => {
    for (const modo of ["uma_hora", "amanha", "proxima_semana"] as const) {
      expect(prazoAdiado(modo, iso(-30 * DIA), AGORA).getTime()).toBeGreaterThan(AGORA.getTime());
    }
  });
});

describe("atraso relativo", () => {
  it("dias, horas e minutos — e nada para quem não está atrasada", () => {
    expect(atrasoRelativo(atrasadaMinha, AGORA)).toEqual({ valor: 16, unidade: "day" });
    expect(atrasoRelativo(tarefa({ due_date: iso(-3 * HORA) }), AGORA)).toEqual({ valor: 3, unidade: "hour" });
    expect(atrasoRelativo(tarefa({ due_date: iso(-20 * 60_000) }), AGORA)).toEqual({ valor: 20, unidade: "minute" });
    expect(atrasoRelativo(hojeDoPedro, AGORA)).toBeNull();
    expect(atrasoRelativo(encerrada, AGORA)).toBeNull();
    expect(atrasoRelativo(avulsaSemPrazo, AGORA)).toBeNull();
  });
});

describe("o clique na tarefa", () => {
  it("de negócio com funil abre o DOSSIÊ; as outras, a edição", () => {
    expect(destinoAoAbrir(hojeDoPedro)).toEqual({ tipo: "dossie", leadId: "lead-1", pipelineId: FUNIL });
    expect(destinoAoAbrir(semDonoAmanha)).toEqual({ tipo: "edicao" });
    expect(destinoAoAbrir(avulsaSemPrazo)).toEqual({ tipo: "edicao" });
    // Negócio que a pessoa não enxerga: o embutido vem nulo e não há para onde ir.
    expect(destinoAoAbrir(tarefa({ lead_id: "lead-x", lead: null }))).toEqual({ tipo: "edicao" });
  });
});

describe("contrato do lote", () => {
  const ID = "66666666-6666-4666-8666-666666666666";
  it("aceita as cinco ações e recusa id repetido, vazio e acima de 50", () => {
    expect(loteDeTarefasSchema.safeParse({ action: "complete", task_ids: [ID] }).success).toBe(true);
    expect(loteDeTarefasSchema.safeParse({ action: "priority", task_ids: [ID], priority: "high" }).success).toBe(true);
    expect(loteDeTarefasSchema.safeParse({ action: "assign", task_ids: [ID], assigned_to: null }).success).toBe(true);
    expect(loteDeTarefasSchema.safeParse({ action: "postpone", itens: [{ id: ID, due_date: iso(DIA) }] }).success).toBe(true);
    expect(loteDeTarefasSchema.safeParse({ action: "delete", task_ids: [ID, ID] }).success).toBe(false);
    expect(loteDeTarefasSchema.safeParse({ action: "delete", task_ids: [] }).success).toBe(false);
    const muitos = Array.from({ length: 51 }, (_, i) => `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`);
    expect(loteDeTarefasSchema.safeParse({ action: "delete", task_ids: muitos }).success).toBe(false);
    expect(loteDeTarefasSchema.safeParse({ action: "apagar_tudo", task_ids: [ID] }).success).toBe(false);
  });

  it("idsDoLote lê os itens do adiar", () => {
    expect(idsDoLote({ action: "postpone", itens: [{ id: ID, due_date: iso(DIA) }] })).toEqual([ID]);
  });
});
