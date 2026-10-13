import { nomeDoCard } from "@/lib/kanban/identidade-do-card";
import { esperandoDesde, type OrdemDoFunil } from "@/lib/kanban/ordem-do-funil";
import { origemDoLead, rotuloDaOrigem } from "@/lib/kanban/recorte-do-funil";
import type { Lead } from "@/lib/types/leads";

/** As colunas da Lista do Funil (board "Barra do Funil", 13/10/2026). */
export type ColunaDaLista = "nome" | "etapa" | "valor" | "responsavel" | "passo" | "parado" | "esperando" | "origem";
export type Sentido = "asc" | "desc";

export const COLUNAS_DA_LISTA: ReadonlyArray<{ id: ColunaDaLista; rotulo: string }> = [
  { id: "nome", rotulo: "Nome" },
  { id: "etapa", rotulo: "Etapa" },
  { id: "valor", rotulo: "Valor" },
  { id: "responsavel", rotulo: "Responsável" },
  { id: "passo", rotulo: "Próximo passo" },
  { id: "parado", rotulo: "Parado há" },
  { id: "esperando", rotulo: "Esperando há" },
  { id: "origem", rotulo: "Origem" },
];

/**
 * A coluna que mostra a ORDEM escolhida no menu, para o `aria-sort` dizer a
 * verdade quando ninguém clicou num cabeçalho. "Mais recentes" não tem coluna.
 */
export function colunaDaOrdem(ordem: OrdemDoFunil): { coluna: ColunaDaLista; sentido: Sentido } | null {
  switch (ordem) {
    case "esperando":
      return { coluna: "esperando", sentido: "desc" };
    case "parados":
      return { coluna: "parado", sentido: "desc" };
    case "valor":
      return { coluna: "valor", sentido: "desc" };
    case "urgente":
      return { coluna: "passo", sentido: "asc" };
    default:
      return null;
  }
}

export interface ContextoDaLista {
  posicaoDaEtapa: (stageId: string) => number;
  nomeDoDono: (lead: Lead) => string;
}

/**
 * O valor de cada lead na coluna. Tempo vira DURAÇÃO (mais antigo = maior),
 * para "desc" ser "há mais tempo" em Parado e Esperando, como lê o operador.
 */
function chave(lead: Lead, coluna: ColunaDaLista, ctx: ContextoDaLista): string | number | null {
  switch (coluna) {
    case "nome":
      return nomeDoCard(lead).nome.toLocaleLowerCase("pt-BR") || null;
    case "etapa":
      return ctx.posicaoDaEtapa(lead.stage_id);
    case "valor":
      return lead.value_cents && lead.value_cents > 0 ? lead.value_cents : null;
    case "responsavel":
      return ctx.nomeDoDono(lead).toLocaleLowerCase("pt-BR") || null;
    case "passo": {
      const ms = lead.proximo_passo?.prazo ? new Date(lead.proximo_passo.prazo).getTime() : NaN;
      return Number.isFinite(ms) ? ms : null;
    }
    case "parado":
      return -new Date(lead.stage_changed_at ?? lead.created_at).getTime();
    case "esperando": {
      const desde = esperandoDesde(lead);
      return desde ? -new Date(desde).getTime() : null;
    }
    case "origem":
      return rotuloDaOrigem(origemDoLead(lead)).toLocaleLowerCase("pt-BR");
  }
}

/** Ordena por uma coluna; vazio vai sempre para o fim; empate mantém a ordem recebida. */
export function ordenarPorColuna(leads: Lead[], coluna: ColunaDaLista, sentido: Sentido, ctx: ContextoDaLista): Lead[] {
  const fator = sentido === "asc" ? 1 : -1;
  return leads
    .map((lead, i) => ({ lead, i, k: chave(lead, coluna, ctx) }))
    .sort((a, b) => {
      if (a.k === null || b.k === null) return a.k === b.k ? a.i - b.i : a.k === null ? 1 : -1;
      const r = typeof a.k === "number" && typeof b.k === "number" ? a.k - b.k : String(a.k).localeCompare(String(b.k), "pt-BR");
      return r === 0 ? a.i - b.i : r * fator;
    })
    .map((x) => x.lead);
}
