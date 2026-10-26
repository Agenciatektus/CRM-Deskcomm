/**
 * A LISTA ÚNICA DA PÁGINA DE CONEXÕES.
 *
 * Antes, cada canal morava numa aba com a sua própria leitura. A página nova mostra tudo
 * junto, e esta é a única função que sabe de que fonte vem cada linha e o que a pessoa
 * pode fazer com ela. Ela mora em `lib/channels/` porque é aqui que o nome do provider
 * pode aparecer; a tela só recebe `tipo`, `metodo` e as ações já resolvidas.
 *
 * Nenhuma fonte nova: tudo sai de `/channel-sessions` (canais de mensagem), de
 * `/channels/hosted` (só para saber QUAIS foram criados por QR neste CRM, o que o
 * `/channel-sessions` não diz), da voz e dos números de telefone.
 */
import type { ChannelSession } from "@/hooks/channels/useChannelSessions";

import { CHANNEL_PROVIDER_SOCIAL, DEFAULT_CHANNEL_PROVIDER, capabilitiesOf } from "./capabilities";
import type { ChannelProvider } from "./capabilities";
import { canalDesativado } from "./desativado";
import { ehEstadoDoCanal, nomeDoCanal, type EstadoDoCanal } from "./estado";
import { fonteDeTemplates } from "./templates-fonte";

export type TipoDeConexao = "whatsapp" | "instagram" | "ligacao";
export type MetodoDeConexao = "qr" | "oficial" | "parceiro" | "verdash" | "instagram" | "wacalls" | "telefone";
export type FonteDaLinha = "canal" | "voz" | "telefone";

export interface ItemDeConexao {
  id: string;
  fonte: FonteDaLinha;
  tipo: TipoDeConexao;
  metodo: MetodoDeConexao;
  nome: string;
  numero: string | null;
  status: EstadoDoCanal | null;
  pausado: boolean;
  /** Criada por QR neste CRM: é a única que o assistente sabe retomar. */
  nativa: boolean;
  /** Fala pelo serviço de WhatsApp por QR (só ele precisa estar no ar para reconectar e excluir). */
  viveNoTransporte: boolean;
  temGrupos: boolean;
  temModelos: boolean;
  mudouEm: string | null;
  nomeCru: string | null;
  sessao: ChannelSession | null;
}

export interface FontesDaLista {
  sessoes: ChannelSession[];
  /** `id -> origem` das conexões hospedadas (`nativa` = criada por QR aqui). */
  origens: Record<string, string | undefined>;
  voz: { paired: boolean; status: string | null; jid: string | null } | null;
  telefones: { id: string; number: string; label: string | null; is_active: boolean }[];
}

function metodoDoCanal(c: ChannelSession, nativa: boolean): MetodoDeConexao {
  switch (c.provider ?? DEFAULT_CHANNEL_PROVIDER) {
    case "meta_cloud":
      return "oficial";
    case "zernio":
    case "datafy":
      return "parceiro";
    case "instagram":
      return "instagram";
    case "verdash":
      return nativa ? "qr" : "verdash";
    default:
      return "qr";
  }
}

function doCanal(c: ChannelSession, origens: FontesDaLista["origens"]): ItemDeConexao {
  const nativa = origens[c.id] === "nativa";
  const metodo = metodoDoCanal(c, nativa);
  const capacidades = capabilitiesOf((c.provider ?? DEFAULT_CHANNEL_PROVIDER) as ChannelProvider);
  return {
    id: c.id,
    fonte: "canal",
    tipo: metodo === "instagram" ? "instagram" : "whatsapp",
    metodo,
    nome: nomeDoCanal(c),
    nomeCru: c.display_name,
    numero: c.phone_number?.trim() || null,
    status: ehEstadoDoCanal(c.status) ? c.status : null,
    pausado: canalDesativado(c.metadata),
    nativa,
    viveNoTransporte: (c.provider ?? DEFAULT_CHANNEL_PROVIDER) === "waha",
    temGrupos: capacidades.groups !== "none",
    temModelos: fonteDeTemplates(c.provider) !== null,
    mudouEm: c.last_status_change_at ?? c.created_at ?? null,
    sessao: c,
  };
}

const BASE_LIGACAO = {
  tipo: "ligacao",
  nativa: false,
  viveNoTransporte: false,
  temGrupos: false,
  temModelos: false,
  sessao: null,
  nomeCru: null,
} as const;

/** Junta as quatro fontes numa lista só. Canal social (Redes sociais) não entra. */
export function montarConexoes(f: FontesDaLista): ItemDeConexao[] {
  const itens: ItemDeConexao[] = f.sessoes
    .filter((c) => c.provider !== CHANNEL_PROVIDER_SOCIAL)
    .map((c) => doCanal(c, f.origens));
  if (f.voz?.paired) {
    itens.push({
      ...BASE_LIGACAO,
      id: "voz",
      fonte: "voz",
      metodo: "wacalls",
      nome: "Chamada de voz",
      numero: f.voz.jid,
      status: ehEstadoDoCanal(f.voz.status) ? f.voz.status : "WORKING",
      pausado: false,
      mudouEm: null,
    });
  }
  for (const n of f.telefones) {
    itens.push({
      ...BASE_LIGACAO,
      id: `telefone-${n.id}`,
      fonte: "telefone",
      metodo: "telefone",
      nome: n.label?.trim() || n.number,
      numero: n.number,
      status: "WORKING",
      pausado: !n.is_active,
      mudouEm: null,
    });
  }
  return itens;
}

const ATENCAO: (EstadoDoCanal | null)[] = ["STARTING", "SCAN_QR_CODE", "FAILED", "STOPPED", null];

export function precisaDeAtencao(i: ItemDeConexao): boolean {
  return !i.pausado && ATENCAO.includes(i.status);
}

export function conectada(i: ItemDeConexao): boolean {
  return !i.pausado && i.status === "WORKING";
}

export function calcularKpis(itens: ItemDeConexao[]): { conectados: number; atencao: number; total: number } {
  return {
    conectados: itens.filter(conectada).length,
    atencao: itens.filter(precisaDeAtencao).length,
    total: itens.length,
  };
}

export type FiltroDeStatus = "" | "conectado" | "atencao" | "pausado";

export interface FiltrosDaLista {
  busca: string;
  tipo: "" | TipoDeConexao;
  metodo: "" | MetodoDeConexao;
  status: FiltroDeStatus;
}

export const SEM_FILTROS: FiltrosDaLista = { busca: "", tipo: "", metodo: "", status: "" };

const soDigitos = (s: string) => s.replace(/\D/g, "");

export function filtrarConexoes(itens: ItemDeConexao[], f: FiltrosDaLista): ItemDeConexao[] {
  const busca = f.busca.trim().toLowerCase();
  const digitos = soDigitos(busca);
  return itens.filter((i) => {
    if (f.tipo && i.tipo !== f.tipo) return false;
    if (f.metodo && i.metodo !== f.metodo) return false;
    if (f.status === "conectado" && !conectada(i)) return false;
    if (f.status === "atencao" && !precisaDeAtencao(i)) return false;
    if (f.status === "pausado" && !i.pausado) return false;
    if (!busca) return true;
    if (i.nome.toLowerCase().includes(busca)) return true;
    return digitos.length > 0 && soDigitos(i.numero ?? "").includes(digitos);
  });
}

export type AcaoDaConexao =
  | "abrir"
  | "renomear"
  | "protecao"
  | "pausar"
  | "retomar"
  | "grupos"
  | "excluir"
  | "continuar"
  | "cancelar"
  | "reconectar"
  | "gerenciar";

/**
 * O que a pessoa pode fazer, pelo ESTADO. Só entra o que já tem caminho hoje: reconectar
 * canal sem sessão no transporte (API oficial, Instagram) a rota recusa, então ali o
 * caminho é "Gerenciar" (reabrir as credenciais). Sem o serviço de WhatsApp no ar, canal
 * que depende dele também não ganha "Reconectar".
 */
export function acoesDaConexao(i: ItemDeConexao, transporteNoAr: boolean): AcaoDaConexao[] {
  if (i.fonte !== "canal") return ["gerenciar"];
  if (i.pausado) return ["retomar", "excluir"];
  switch (i.status) {
    case "WORKING":
      return [
        "abrir",
        "renomear",
        "protecao",
        "pausar",
        ...(i.temGrupos ? (["grupos"] as const) : []),
        "excluir",
      ];
    case "STARTING":
    case "SCAN_QR_CODE":
      if (i.nativa) return ["continuar", "cancelar"];
      return [...(podeReconectar(i, transporteNoAr) ? (["reconectar"] as const) : []), "excluir"];
    case "FAILED":
    case "STOPPED":
      if (podeReconectar(i, transporteNoAr)) return ["reconectar", "excluir"];
      return i.viveNoTransporte ? ["excluir"] : ["gerenciar", "excluir"];
    default:
      return ["excluir"];
  }
}

function podeReconectar(i: ItemDeConexao, transporteNoAr: boolean): boolean {
  return i.nativa || (i.viveNoTransporte && transporteNoAr);
}

/** Para onde "Gerenciar" leva: a tela de apoio do método (as credenciais e o que já existe). */
export function destinoDeGerenciar(i: ItemDeConexao): string {
  switch (i.metodo) {
    case "oficial":
      return "/app/connections?aba=oficial";
    case "parceiro":
      return "/app/connections?aba=parceiro";
    case "instagram":
      return "/app/connections?aba=instagram";
    case "verdash":
      return "/app/connections?aba=hospedado";
    case "wacalls":
      return "/app/connections?aba=voz";
    case "telefone":
      return "/app/connections?aba=telefonia";
    default:
      return "/app/connections";
  }
}

/** Minutos desde `desde`, ou null se a data não existe ou é inválida. */
export function minutosDesde(desde: string | null, agora: number): number | null {
  if (!desde) return null;
  const ms = Date.parse(desde);
  return Number.isNaN(ms) ? null : Math.max(0, Math.floor((agora - ms) / 60_000));
}

/** A frase de detalhe de cada linha. Depois de 2 minutos conectando, "Está demorando". */
export function detalheDaConexao(
  i: ItemDeConexao,
  agora: number,
  t: (texto: string) => string = (x) => x,
): string {
  if (i.pausado) return t("Pausado por você.");
  switch (i.status) {
    case "STARTING": {
      const min = minutosDesde(i.mudouEm, agora);
      if (min === null) return t("Conectando…");
      const base = `${t("Conectando há")} ${min} min.`;
      return min >= 2 ? `${base} ${t("Está demorando.")}` : base;
    }
    case "SCAN_QR_CODE":
      return t("Aguardando a leitura do QR.");
    case "FAILED":
      return t("Esta conexão caiu. Reconecte para voltar a receber mensagens.");
    case "STOPPED":
      return t("Esta conexão está parada.");
    case "WORKING":
      return t("Conectada.");
    default:
      return t("Situação desconhecida");
  }
}

/** O selo do método, na palavra que a pessoa reconhece (a mesma da escolha de fluxo). */
export const ROTULO_DO_METODO: Record<MetodoDeConexao, string> = {
  qr: "QR Code",
  oficial: "API Oficial",
  parceiro: "Parceiro",
  verdash: "Verdash",
  instagram: "Instagram",
  wacalls: "WaCalls",
  telefone: "Telefone",
};

export const ROTULO_DO_TIPO: Record<TipoDeConexao, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  ligacao: "Ligação",
};
