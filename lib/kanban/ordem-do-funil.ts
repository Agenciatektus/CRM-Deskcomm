import type { Lead } from "@/lib/types/leads";

/**
 * A ORDEM dos leads no Funil (Kanban e Lista) — barra aprovada pelo Peterson
 * (board "Barra do Funil", 13/10/2026). Vale DENTRO de cada coluna do Kanban.
 *
 * Pura e sem React: a tela, a Lista e o teste leem daqui.
 */
export type OrdemDoFunil = "esperando" | "parados" | "recentes" | "valor" | "urgente" | "manual";

/** As opções do menu Ordenar, na ordem do desenho; a primeira é o padrão. */
export const ORDENS_DO_FUNIL: ReadonlyArray<{ id: OrdemDoFunil; rotulo: string; apoio: string }> = [
  {
    id: "esperando",
    rotulo: "Esperando resposta há mais tempo",
    apoio: "Última mensagem do cliente sem resposta, mais antiga primeiro",
  },
  { id: "parados", rotulo: "Parados há mais tempo", apoio: "Mais dias na etapa atual primeiro" },
  { id: "recentes", rotulo: "Mais recentes", apoio: "Entrada no funil, mais nova primeiro" },
  { id: "valor", rotulo: "Maior valor", apoio: "Sem valor vai para o fim" },
  { id: "urgente", rotulo: "Próximo passo mais urgente", apoio: "Atrasados primeiro, depois por horário" },
  { id: "manual", rotulo: "Manual", apoio: "A ordem em que os cards foram arrastados" },
];

export const ORDEM_PADRAO: OrdemDoFunil = "esperando";

export function ehOrdemDoFunil(valor: unknown): valor is OrdemDoFunil {
  return ORDENS_DO_FUNIL.some((o) => o.id === valor);
}

/**
 * Desde quando o cliente espera resposta nesta conversa, ou `null` se a bola
 * está com ele. A régua é a MESMA da Fila do Inbox (`awaiting_since`, issue
 * #990): a mensagem dele mais antiga que ninguém respondeu. Só vale quando a
 * última palavra é do cliente (`last_inbound_at` depois de `last_outbound_at`).
 */
export function esperandoDesdeDaConversa(c: {
  awaiting_since?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
}): string | null {
  if (!c.last_inbound_at) return null;
  if (c.last_outbound_at && c.last_outbound_at >= c.last_inbound_at) return null;
  return c.awaiting_since ?? c.last_inbound_at;
}

/** O "Esperando há" do lead: o da conversa mais recente do contato. */
export function esperandoDesde(lead: Pick<Lead, "conversa">): string | null {
  return lead.conversa?.esperando_desde ?? null;
}

/** Faixas do Funil (diferentes da Fila): azul até 1 h, âmbar até 4 h, vermelho acima. */
export const LIMIAR_ESPERA_ATENCAO_MIN = 60;
export const LIMIAR_ESPERA_CRITICA_MIN = 240;

export type TomDaEsperaDoFunil = "info" | "warn" | "crit";

export function tomDaEsperaDoFunil(desde: string | null, agora: Date = new Date()): TomDaEsperaDoFunil {
  if (!desde) return "info";
  const minutos = (agora.getTime() - new Date(desde).getTime()) / 60_000;
  if (!Number.isFinite(minutos)) return "info";
  if (minutos > LIMIAR_ESPERA_CRITICA_MIN) return "crit";
  if (minutos > LIMIAR_ESPERA_ATENCAO_MIN) return "warn";
  return "info";
}

/** "5 min", "3 h", "2 dias": o quanto, sem o "há". */
export function duracaoCurta(desde: string | null, agora: Date = new Date(), t: (s: string) => string = (s) => s): string | null {
  if (!desde) return null;
  const min = Math.max(0, Math.floor((agora.getTime() - new Date(desde).getTime()) / 60_000));
  if (!Number.isFinite(min)) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? t("dia") : t("dias")}`;
}

type LeadOrdenavel = Pick<
  Lead,
  "position_in_stage" | "conversa" | "stage_changed_at" | "created_at" | "value_cents" | "proximo_passo"
>;

/** Ausente vai SEMPRE para o fim, nos dois sentidos: comparar só os presentes. */
function porPresente<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number): number | null {
  if (a == null && b == null) return null;
  if (a == null) return 1;
  if (b == null) return -1;
  const r = cmp(a, b);
  return r === 0 ? null : r;
}

const texto = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

function instante(v: string | null | undefined): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * O comparador da ordem escolhida. Empate (e quem não entra na régua, como o
 * lead que não espera resposta) cai na posição manual da etapa, para o
 * arrastar continuar valendo entre os iguais.
 */
export function comparadorDoFunil(ordem: OrdemDoFunil): (a: LeadOrdenavel, b: LeadOrdenavel) => number {
  const regua = (a: LeadOrdenavel, b: LeadOrdenavel): number | null => {
    switch (ordem) {
      case "esperando":
        return porPresente(esperandoDesde(a), esperandoDesde(b), texto);
      case "parados":
        return porPresente(a.stage_changed_at ?? a.created_at, b.stage_changed_at ?? b.created_at, texto);
      case "recentes":
        return porPresente(a.created_at, b.created_at, (x, y) => texto(y, x));
      case "valor":
        return porPresente(
          a.value_cents && a.value_cents > 0 ? a.value_cents : null,
          b.value_cents && b.value_cents > 0 ? b.value_cents : null,
          (x, y) => y - x,
        );
      case "urgente":
        // Prazo inválido conta como sem prazo (NaN não pode quebrar a ordem).
        return porPresente(instante(a.proximo_passo?.prazo), instante(b.proximo_passo?.prazo), (x, y) => x - y);
      case "manual":
        return null;
    }
  };
  return (a, b) => regua(a, b) ?? a.position_in_stage - b.position_in_stage;
}
