import { canalDoCard, ROTULO_DO_CANAL } from "@/lib/kanban/identidade-do-card";
import { tempoNaEtapa } from "@/lib/kanban/tempo-na-etapa";
import type { Lead } from "@/lib/types/leads";

/**
 * As regras do RECORTE da barra do Funil (board "Barra do Funil", 13/10/2026):
 * busca, atalhos, origem, período e o resumo do título. Puras: o filtro
 * (`applyFilters`), as contagens dos atalhos e o resumo leem as MESMAS
 * funções, para o número do botão e a lista nunca discordarem.
 */

const soDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * Busca por nome, telefone (com ou sem máscara e com ou sem o 55), @ do
 * Instagram (com ou sem arroba) e título. Roda sobre o que a rota do quadro já
 * anexa a cada lead (uma leitura de `contacts` por quadro): nenhuma consulta
 * nova, nenhum `.in()` na URL.
 */
export function passaNaBusca(
  lead: Pick<Lead, "title" | "description" | "contact_name" | "contact_instagram" | "contact_phone">,
  termoBruto: string,
): boolean {
  const termo = termoBruto.trim().toLowerCase();
  if (!termo) return true;
  const semArroba = termo.replace(/^@/, "");
  const textos = [lead.title, lead.description ?? "", lead.contact_name ?? "", lead.contact_instagram ?? ""];
  if (textos.some((t) => t.toLowerCase().includes(semArroba))) return true;
  const digitos = soDigitos(termo);
  // Só busca por telefone com 4+ dígitos: "2" casaria quase todo número.
  if (digitos.length < 4 || !lead.contact_phone) return false;
  const tel = soDigitos(lead.contact_phone);
  return tel.includes(digitos) || (digitos.startsWith("55") && tel.includes(digitos.slice(2)));
}

/** Próximo passo vencido (a mesma regra do "Atrasada" do card). Negócio aberto só. */
export function estaAtrasado(lead: Pick<Lead, "status" | "proximo_passo">, agora: Date): boolean {
  const prazo = lead.proximo_passo?.prazo;
  return lead.status === "open" && !!prazo && new Date(prazo).getTime() < agora.getTime();
}

/** Nenhuma tarefa aberta. `undefined` (não carregou) NÃO conta: não se afirma sem saber. */
export function semProximoPasso(lead: Pick<Lead, "status" | "proximo_passo">): boolean {
  return lead.status === "open" && lead.proximo_passo === null;
}

/** Passou do limite da etapa (`expected_duration_hours`): a mesma régua do "Parado há" do card. */
export function estaParado(
  lead: Pick<Lead, "status" | "stage_id" | "stage_changed_at" | "created_at">,
  limiteDaEtapa: (stageId: string) => number | null | undefined,
  agora: Date,
): boolean {
  if (lead.status !== "open") return false;
  const desde = lead.stage_changed_at ?? lead.created_at;
  const horas = (agora.getTime() - new Date(desde).getTime()) / 3_600_000;
  return tempoNaEtapa(horas, limiteDaEtapa(lead.stage_id))?.nivel !== "neutro";
}

/** Rótulos das origens conhecidas (chave de i18n); origem livre sai como está. */
const ROTULO_DA_ORIGEM: Record<string, string> = {
  ...ROTULO_DO_CANAL,
  manual: "Manual",
  api: "API",
  webhook: "Webhook",
  import: "Importação",
};

/**
 * O canal de origem do lead: o canal da conversa (WhatsApp, Direct,
 * Comentário), e sem ele o `source` que o CRM já grava. As opções do filtro
 * saem do que ESTÁ no quadro, como os motivos de perda.
 */
export function origemDoLead(lead: Pick<Lead, "source" | "conversa" | "contact_phone">): string {
  return canalDoCard(lead) ?? (lead.source?.trim() || "manual");
}

export function rotuloDaOrigem(origem: string): string {
  return ROTULO_DA_ORIGEM[origem] ?? origem;
}

export type PeriodoDeCriacao = "hoje" | "7d" | "30d" | "mes";
export const PERIODOS: ReadonlyArray<{ id: PeriodoDeCriacao; rotulo: string }> = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "7 dias" },
  { id: "30d", rotulo: "30 dias" },
  { id: "mes", rotulo: "Este mês" },
];

export function ehPeriodo(v: unknown): v is PeriodoDeCriacao {
  return PERIODOS.some((p) => p.id === v);
}

/** O início do período, no fuso de quem olha. */
export function inicioDoPeriodo(periodo: PeriodoDeCriacao, agora: Date): Date {
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  if (periodo === "7d") d.setDate(d.getDate() - 6);
  if (periodo === "30d") d.setDate(d.getDate() - 29);
  if (periodo === "mes") d.setDate(1);
  return d;
}

/** O resumo do título: abertos, soma do valor (moeda do primeiro) e atrasados do recorte. */
export function resumoDoRecorte(leads: Lead[], agora: Date) {
  const abertos = leads.filter((l) => l.status === "open");
  return {
    abertos: abertos.length,
    centavos: abertos.reduce((s, l) => s + (l.value_cents ?? 0), 0),
    moeda: abertos.find((l) => l.currency)?.currency ?? null,
    atrasados: abertos.filter((l) => estaAtrasado(l, agora)).length,
  };
}
