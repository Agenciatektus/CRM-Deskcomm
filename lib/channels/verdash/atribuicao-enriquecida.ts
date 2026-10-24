/**
 * Completa a atribuição de anúncio de um contato com o que a Verdash sabe.
 *
 * A mensagem do anúncio traz o id do anúncio e o clique, mas não o NOME da
 * campanha nem do conjunto: quem os resolve é o enriquecimento (Graph da Meta, via
 * módulo Tráfego Pago do FZAP), que a Verdash roda. Esta função pergunta a ela,
 * por `crm-atribuicao-do-lead`, e grava no `source_metadata` do contato só o que
 * falta. Só vale para o canal PAREADO; sem vínculo não há a quem perguntar.
 *
 * ─── Regras que não se quebram ──────────────────────────────────────────────
 *
 * - **Só preenche.** Nunca sobrescreve o que já está no contato: o primeiro toque
 *   é do banco (`fn_estampar_atribuicao_de_anuncio`), e uma correção feita à mão
 *   também não se perde.
 * - **O anúncio tem de ser o mesmo.** Se o contato tem `ad_id` e a Verdash devolve
 *   outro, não se mistura: o nome de outra peça na ficha seria pior que nenhum.
 * - **Escrita otimista.** Lê e grava com `updated_at` no filtro: se algo mexeu no
 *   contato no meio, a escrita casa zero linhas e fica para a próxima. Sem RPC
 *   nova, e sem pisar numa chave que o ingest gravou agora.
 * - Nunca lança: a ficha do contato não quebra porque a Verdash está fora.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { ARCHIVED_AT } from "../archived";
import { type AtribuicaoDaVerdash, verdashAtribuicaoPareada } from "./client";
import { resolveVerdashCreds } from "./credentials";

const TETO_DO_TEXTO = 300;

export interface NomesDoAnuncio {
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, TETO_DO_TEXTO) : null;
}

/** Chaves que a Verdash pode completar, na ordem em que entram. */
const CHAVES = [
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
] as const;

/**
 * O que acrescentar ao `source_metadata`: só as chaves que lá estão vazias, e
 * `null` quando o anúncio da Verdash não é o do contato (ou não há o que somar).
 */
export function completarComAVerdash(
  meta: Record<string, unknown>,
  verdash: AtribuicaoDaVerdash,
): Record<string, string> | null {
  const adDoContato = texto(meta.ad_id);
  const adDaVerdash = texto(verdash.ad_id);
  if (adDoContato && adDaVerdash && adDoContato !== adDaVerdash) return null;

  const novo: Record<string, string> = {};
  for (const chave of CHAVES) {
    if (texto(meta[chave])) continue;
    const valor = texto(verdash[chave]);
    if (valor) novo[chave] = valor;
  }
  return Object.keys(novo).length > 0 ? novo : null;
}

/**
 * Pede à Verdash, completa o contato e devolve os nomes (ou `null`).
 * `null` não é erro: contato que não veio de anúncio, canal sem vínculo, Verdash
 * sem o nome ainda.
 */
export async function completarAtribuicaoPelaVerdash(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<NomesDoAnuncio | null> {
  try {
    const { data: contato } = await admin
      .from("contacts")
      .select("phone_number, source_metadata, updated_at, is_anonymized")
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .maybeSingle();
    if (!contato || contato.is_anonymized || !contato.phone_number) return null;

    const meta = (contato.source_metadata ?? {}) as Record<string, unknown>;
    // Sem sinal de anúncio no contato não há atribuição a completar.
    if (!texto(meta.ad_platform) || texto(meta.ad_platform) === "site") return null;

    // A sessão pareada por onde esta pessoa conversa, a mais recente primeiro.
    const { data: conversas } = await admin
      .from("conversations")
      .select("channel_session_id")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(5);
    const sessaoIds = [
      ...new Set((conversas ?? []).map((c) => c.channel_session_id).filter(Boolean)),
    ] as string[];
    if (sessaoIds.length === 0) return null;

    const { data: sessoes } = await admin
      .from("channel_sessions")
      .select("id, verdash_instance_name, verdash_vinculo_id")
      .eq("organization_id", organizationId)
      .eq("provider", "verdash")
      .not("verdash_vinculo_id", "is", null)
      .is(ARCHIVED_AT, null)
      .in("id", sessaoIds);
    const sessao = (sessoes ?? [])[0];
    if (!sessao?.verdash_instance_name) return null;

    const creds = await resolveVerdashCreds(admin, {
      organizationId,
      instanceName: sessao.verdash_instance_name,
    });
    if (!creds?.vinculoId) return null;

    const respostas = await verdashAtribuicaoPareada(creds, [contato.phone_number]);
    const verdash = respostas.get(contato.phone_number) ?? null;
    if (!verdash) return null;

    const acrescentar = completarComAVerdash(meta, verdash);
    const finais = { ...meta, ...(acrescentar ?? {}) };
    if (acrescentar) {
      const { data: gravou } = await admin
        .from("contacts")
        .update({ source_metadata: { ...finais, ad_enriquecido_por: "verdash" } })
        .eq("organization_id", organizationId)
        .eq("id", contactId)
        .eq("updated_at", contato.updated_at)
        .select("id");
      if (!gravou || gravou.length === 0) {
        logger.info("[atribuicao-enriquecida] contato mudou no meio; fica para a próxima", {
          contactId,
        });
      }
    }

    return {
      ad_name: texto(finais.ad_name),
      adset_name: texto(finais.adset_name),
      campaign_name: texto(finais.campaign_name),
    };
  } catch (err) {
    logger.warn("[atribuicao-enriquecida] falhou; a ficha segue sem o nome", {
      contactId,
      erro: err instanceof Error ? err.message.slice(0, 200) : "desconhecido",
    });
    return null;
  }
}
