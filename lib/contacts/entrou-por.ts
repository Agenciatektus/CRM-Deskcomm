/**
 * "Entrou por …" na faixa do cabeçalho da conversa (H13 da auditoria do visual
 * v2), para qualquer origem que o CRM já grava no CONTATO.
 *
 * ─── De onde vem cada uma (conferido no código e em produção, 10/10/2026) ────
 *
 *   - anúncio: `source_metadata.ad_platform`, carimbado no primeiro toque por
 *     `fn_estampar_atribuicao_de_anuncio` (`meta_ads`, `google_ads`, `site`),
 *     com `campaign_name` quando a plataforma manda;
 *   - formulário/site com UTM: `source_metadata.utm_source` (captação por
 *     webhook, `lib/webhooks/inbound.ts`), com `utm_campaign`;
 *   - a coluna `source`: importação (`import_csv`, `import_aplicativa`,
 *     `imports`), captação (`lead_captures`, `webhook`), campanha (`campaign`)
 *     e prospecção (`prospecting`).
 *
 * O CANAL não vira origem aqui (`whatsapp`, `instagram`, `social`): o selo do
 * canal já está no avatar, e o Direct/Comentário do Instagram tem o seu próprio
 * rótulo (`instagram_entrada`), que continua tendo prioridade. `manual` e
 * `automation` também não: não dizem por onde a PESSOA chegou.
 *
 * INDICAÇÃO não existe em lugar nenhum do schema (nem coluna, nem chave de
 * `source_metadata`); só aparece se vier como `utm_source`.
 */

export interface EntradaDoContato {
  /** Palavra da interface (passa por `t()`), ou o texto cru do banco. */
  rotulo: string;
  traduzir: boolean;
  /** Campanha, quando o dado existe. Do banco: nunca passa por `t()`. */
  campanha: string | null;
}

export interface OrigemGravada {
  source?: string | null;
  ad_platform?: string | null;
  utm_source?: string | null;
  campaign_name?: string | null;
  utm_campaign?: string | null;
}

const PLATAFORMA: Record<string, string> = {
  meta_ads: "Anúncio da Meta",
  google_ads: "Google Ads",
  site: "Site",
};

const PELA_COLUNA: Record<string, string> = {
  import_csv: "Importação",
  import_aplicativa: "Importação",
  imports: "Importação",
  lead_captures: "Formulário",
  webhook: "Formulário",
  campaign: "Campanha",
  prospecting: "Prospecção",
};

function texto(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function entrouPor(o: OrigemGravada | null | undefined): EntradaDoContato | null {
  if (!o) return null;
  const plataforma = texto(o.ad_platform);
  if (plataforma && PLATAFORMA[plataforma]) {
    return { rotulo: PLATAFORMA[plataforma], traduzir: true, campanha: texto(o.campaign_name) ?? texto(o.utm_campaign) };
  }
  const utm = texto(o.utm_source);
  if (utm) return { rotulo: utm, traduzir: false, campanha: texto(o.utm_campaign) };
  const coluna = texto(o.source);
  if (coluna && PELA_COLUNA[coluna]) return { rotulo: PELA_COLUNA[coluna], traduzir: true, campanha: null };
  return null;
}
