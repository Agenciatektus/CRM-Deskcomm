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
import {
  type AtribuicaoDaVerdash,
  fzapAtribuicaoDireta,
  verdashAtribuicaoPareada,
} from "./client";
import { resolveVerdashCreds } from "./credentials";

const TETO_DO_TEXTO = 300;
/** A ficha do contato não espera a Verdash por mais que isto. */
const PRAZO_DA_FICHA_MS = 5_000;

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
  // Com anúncio no contato, o da Verdash tem de ser O MESMO: um lead sem `ad_id`
  // (site, UTM) com nome de campanha de outra origem não pode emprestar o nome.
  if (adDoContato && adDaVerdash !== adDoContato) return null;

  const novo: Record<string, string> = {};
  for (const chave of CHAVES) {
    if (texto(meta[chave])) continue;
    const valor = texto(verdash[chave]);
    if (valor) novo[chave] = valor;
  }
  return Object.keys(novo).length > 0 ? novo : null;
}

/** Quanto tempo uma tentativa sem novidade vale antes de perguntar de novo. */
const ESPERA_ENTRE_TENTATIVAS_MS = 6 * 60 * 60 * 1000;

/**
 * Já perguntamos há pouco e nada novo veio? A ficha e o Inbox chamam isto a cada
 * abertura de conversa: sem esta espera, quem atende gera uma consulta por
 * clique à Verdash e ao FZAP para um contato cujo nome ainda não existe lá.
 */
export function tentouHaPouco(meta: Record<string, unknown>, agora: number = Date.now()): boolean {
  const quando = texto(meta.ad_enriquecimento_tentado_em);
  if (!quando) return false;
  const t = Date.parse(quando);
  return Number.isFinite(t) && agora - t >= 0 && agora - t < ESPERA_ENTRE_TENTATIVAS_MS;
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
  opts: { ignorarEspera?: boolean } = {},
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
    const atuais = (): NomesDoAnuncio => ({
      ad_name: texto(meta.ad_name),
      adset_name: texto(meta.adset_name),
      campaign_name: texto(meta.campaign_name),
    });
    // Sem sinal de anúncio no contato não há atribuição a completar.
    if (!texto(meta.ad_platform) || texto(meta.ad_platform) === "site") return null;
    // Os três nomes já estão no contato: nada a perguntar (e nada a esperar).
    if (texto(meta.ad_name) && texto(meta.adset_name) && texto(meta.campaign_name)) {
      return {
        ad_name: texto(meta.ad_name),
        adset_name: texto(meta.adset_name),
        campaign_name: texto(meta.campaign_name),
      };
    }

    // Perguntou há pouco e não veio nada: não pergunta de novo a cada abertura.
    // (O gatilho do FZAP avisa que há dado novo: nesse caso a espera não vale.)
    if (!opts.ignorarEspera && tentouHaPouco(meta)) return atuais();

    // A sessão por onde esta pessoa conversa (pareada OU direta), a mais recente primeiro.
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
      .is(ARCHIVED_AT, null)
      .in("id", sessaoIds);
    // A mais recente primeiro: `in` não preserva a ordem das conversas.
    const sessao = sessaoIds
      .map((id) => (sessoes ?? []).find((x) => x.id === id))
      .find((x) => x?.verdash_instance_name);
    if (!sessao?.verdash_instance_name) return null;

    const creds = await resolveVerdashCreds(admin, {
      organizationId,
      instanceName: sessao.verdash_instance_name,
    });
    if (!creds) return null;

    // Pareado: quem responde é a função da Verdash. Direto: o CRM tem o token da
    // instância e pergunta ao módulo de tráfego pago do FZAP.
    const verdash = creds.vinculoId
      ? ((await verdashAtribuicaoPareada(creds, [contato.phone_number], PRAZO_DA_FICHA_MS)).get(
          contato.phone_number,
        ) ?? null)
      : await fzapAtribuicaoDireta(creds, contato.phone_number, PRAZO_DA_FICHA_MS);
    const acrescentar = verdash ? completarComAVerdash(meta, verdash) : null;
    const finais = { ...meta, ...(acrescentar ?? {}) };
    // Nada novo: marca a tentativa, e a próxima abertura dentro da espera nem pergunta.
    const marcaDaTentativa = acrescentar
      ? {}
      : { ad_enriquecimento_tentado_em: new Date().toISOString() };
    if (acrescentar || Object.keys(marcaDaTentativa).length > 0) {
      const { data: gravou } = await admin
        .from("contacts")
        .update({
          source_metadata: {
            ...finais,
            ...marcaDaTentativa,
            ...(acrescentar ? { ad_enriquecido_por: "verdash" } : {}),
          },
        })
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
