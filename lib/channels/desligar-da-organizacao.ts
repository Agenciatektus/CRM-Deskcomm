/**
 * Desliga do transporte TODOS os canais de uma organização que vai deixar de
 * existir — o par da conexão, visto pela exclusão de tenant
 * (`lib/tenants/exclusao.ts`).
 *
 * Mora aqui, e não na exclusão, porque só a fronteira de canais nomeia o
 * transporte (cerca `pnpm lint:channels`): quem pede é "o tenant está sendo
 * excluído", quem sabe o que cada transporte exige para soltar o número é este
 * módulo. É o mesmo desligamento da exclusão de UM canal
 * (`app/api/v1/channel-sessions/[id]/route.ts`), aplicado a todos:
 *
 *  - sessão por QR: sai do aparelho (logout) e o servidor apaga a sessão;
 *  - número oficial: o webhook do número volta para a URL do app.
 *    A inscrição na WABA não entra: ela é compartilhada com outros números.
 *
 * Em DUAS metades, e a separação é o desenho (decisão do dono, recorte do
 * #1967): `inventariarCanaisDaOrganizacao` LÊ do banco — inclusive a credencial
 * do número oficial, já decifrada, e a sessão de voz — ANTES da transação que
 * apaga as linhas; `desligarCanaisInventariados` só fala com o transporte, sem
 * banco, e roda DEPOIS do commit. Se a transação falhar, nada lá fora caiu: o
 * WhatsApp da empresa segue funcionando e o tenant fica suspenso e intacto. O
 * preço declarado: um desligamento que falha depois do commit deixa a sessão
 * órfã no provedor, com o desfecho `falhou` no registro final.
 *
 * Se a tentativa MORRE depois do commit (resposta perdida, processo
 * reiniciado), o inventário em memória some junto. A lápide da exclusão
 * guarda os identificadores sem segredo de cada canal (migration 0614), e
 * `inventarioDaLapide` os devolve para a nova tentativa: a sessão por QR e a
 * voz voltam a ser desligáveis; o número oficial não — o token só existia na
 * memória da tentativa que morreu —, e vai para o registro como `falhou`, com
 * o `phone_number_id` na lápide para quem for desfazer à mão.
 *
 * Best-effort, canal por canal: um transporte fora do ar não segura a exclusão
 * que o admin pediu, e o desfecho de cada canal volta para o registro final.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHANNEL_PROVIDER_VERDASH, CHANNEL_PROVIDER_WAHA } from "@/lib/channels/capabilities";
import { resolveVerdashCreds } from "@/lib/channels/verdash/credentials";
import type { VerdashCredentials } from "@/lib/channels/verdash/credentials";
import {
  apagarNativoNaPasta,
  desligarNativoNaPasta,
  lerPastaDaOrg,
  resumoDoErro,
} from "@/lib/channels/verdash/nativo";
import type { PastaFzap } from "@/lib/channels/verdash/nativo";
import { desfazerWebhookDoNumero } from "@/lib/channels/meta/webhook-override";
import { getWahaClient } from "@/lib/waha/client";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export type DesfechoDoDesligamento = "ok" | "falhou" | "nao_se_aplica";

export interface CanalDesligado {
  id: string;
  provedor: string;
  desfecho: DesfechoDoDesligamento;
  motivo?: string;
}

/** O que a lápide guarda de cada canal — sem credencial nenhuma. */
export interface CanalNaLapide {
  id: string;
  provider: string;
  waha_session_name: string | null;
  meta_phone_number_id: string | null;
  wacalls_session_id: string | null;
  archived_at: string | null;
}

interface LinhaDoCanal extends CanalNaLapide {
  meta_token_encrypted: string | null;
  verdash_origem: string | null;
  verdash_instance_name: string | null;
  metadata: Record<string, unknown> | null;
}

/** A sessão de voz (WaCalls) é a da linha `provider='wacalls'` não arquivada. */
function sessaoDeVozDa(linha: CanalNaLapide): string | null {
  return linha.provider === "wacalls" && !linha.archived_at && linha.wacalls_session_id
    ? linha.wacalls_session_id
    : null;
}

/** O que o desligamento precisa saber de um canal, lido antes da transação. */
export interface CanalInventariado {
  id: string;
  provider: string;
  wahaSessionName: string | null;
  /** Número oficial: o token já decifrado (em memória), ou o motivo de não ter. */
  meta: { phoneNumberId: string; token: string | null; motivo?: string } | null;
  /**
   * Verdash NATIVA: a pasta e o token da instancia, lidos ANTES da transacao (a
   * pasta some junto com o tenant). Vinculada nunca entra (a instancia e da Verdash).
   */
  nativo?: { organizationId: string; fzapId: string; pasta: PastaFzap; creds: VerdashCredentials | null } | null;
}

export interface InventarioDeCanais {
  canais: CanalInventariado[];
  /** A sessão de voz (WaCalls) da linha `provider='wacalls'` não arquivada. */
  sessaoDeVoz: string | null;
}

function mensagemDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function inventariarNativo(
  admin: SupabaseClient,
  orgId: string,
  linha: LinhaDoCanal,
): Promise<CanalInventariado["nativo"]> {
  const fzapId = linha.metadata?.fzap_user_id;
  if (linha.provider !== CHANNEL_PROVIDER_VERDASH || linha.verdash_origem !== "nativa") return null;
  if (typeof fzapId !== "string") return null;
  const pasta = await lerPastaDaOrg(admin, orgId).catch(() => null);
  if (!pasta) return null;
  const creds = await resolveVerdashCreds(admin, {
    organizationId: orgId,
    instanceName: linha.verdash_instance_name ?? "",
  }).catch(() => null);
  return { organizationId: orgId, fzapId, pasta, creds };
}

/** Metade 1 — só leitura, sem efeito externo. Roda ANTES da transação. */
export async function inventariarCanaisDaOrganizacao(
  admin: SupabaseClient,
  orgId: string,
): Promise<InventarioDeCanais> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select(
      "id, provider, waha_session_name, meta_phone_number_id, meta_token_encrypted, wacalls_session_id, archived_at, verdash_origem, verdash_instance_name, metadata",
    )
    .eq("organization_id", orgId);
  if (error) throw new Error(`inventariar_canais: ${error.message}`);

  const canais: CanalInventariado[] = [];
  let sessaoDeVoz: string | null = null;
  for (const linha of (data ?? []) as LinhaDoCanal[]) {
    sessaoDeVoz = sessaoDeVozDa(linha) ?? sessaoDeVoz;
    let meta: CanalInventariado["meta"] = null;
    if (linha.provider !== CHANNEL_PROVIDER_WAHA && linha.meta_token_encrypted && linha.meta_phone_number_id) {
      try {
        const token = await decryptWebhookSecret(admin, linha.meta_token_encrypted);
        meta = token
          ? { phoneNumberId: linha.meta_phone_number_id, token }
          : { phoneNumberId: linha.meta_phone_number_id, token: null, motivo: "credencial_ilegivel" };
      } catch (err) {
        meta = { phoneNumberId: linha.meta_phone_number_id, token: null, motivo: mensagemDe(err) };
      }
    }
    const nativo = await inventariarNativo(admin, orgId, linha);
    canais.push({
      id: linha.id,
      provider: linha.provider,
      wahaSessionName: linha.waha_session_name,
      meta,
      ...(nativo ? { nativo } : {}),
    });
  }
  return { canais, sessaoDeVoz };
}

/** Metade 1 da RETOMADA — o inventário a partir da lápide, sem banco nem credencial. */
export function inventarioDaLapide(linhas: CanalNaLapide[]): InventarioDeCanais {
  let sessaoDeVoz: string | null = null;
  const canais = linhas.map((linha): CanalInventariado => {
    sessaoDeVoz = sessaoDeVozDa(linha) ?? sessaoDeVoz;
    return {
      id: linha.id,
      provider: linha.provider,
      wahaSessionName: linha.waha_session_name,
      meta:
        linha.provider !== CHANNEL_PROVIDER_WAHA && linha.meta_phone_number_id
          ? { phoneNumberId: linha.meta_phone_number_id, token: null, motivo: "credencial_perdida_na_interrupcao" }
          : null,
    };
  });
  return { canais, sessaoDeVoz };
}

/** Metade 2 — só transporte, sem banco. Roda DEPOIS do commit. */
export async function desligarCanaisInventariados(
  inventario: InventarioDeCanais,
): Promise<CanalDesligado[]> {
  const waha = getWahaClient();
  const saida: CanalDesligado[] = [];
  for (const canal of inventario.canais) {
    try {
      if (canal.provider === CHANNEL_PROVIDER_WAHA) {
        if (!waha || !canal.wahaSessionName) {
          saida.push({ id: canal.id, provedor: canal.provider, desfecho: "nao_se_aplica" });
          continue;
        }
        await waha.logoutSession(canal.wahaSessionName);
        await waha.deleteSession(canal.wahaSessionName);
        saida.push({ id: canal.id, provedor: canal.provider, desfecho: "ok" });
      } else if (canal.provider === CHANNEL_PROVIDER_VERDASH) {
        // Vinculada (sem `nativo`): nao e do CRM, nao se toca.
        if (!canal.nativo) {
          saida.push({ id: canal.id, provedor: canal.provider, desfecho: "nao_se_aplica" });
          continue;
        }
        const { organizationId, fzapId, pasta, creds } = canal.nativo;
        if (creds) await desligarNativoNaPasta(pasta, { organizationId, fzapId, creds }).catch(() => undefined);
        await apagarNativoNaPasta(pasta, { organizationId, fzapId });
        saida.push({ id: canal.id, provedor: canal.provider, desfecho: "ok" });
      } else if (canal.meta) {
        if (!canal.meta.token) {
          saida.push({
            id: canal.id,
            provedor: canal.provider,
            desfecho: "falhou",
            motivo: canal.meta.motivo ?? "credencial_ilegivel",
          });
          continue;
        }
        const desfecho = await desfazerWebhookDoNumero({
          phoneNumberId: canal.meta.phoneNumberId,
          token: canal.meta.token,
        });
        saida.push({
          id: canal.id,
          provedor: canal.provider,
          desfecho: desfecho.ok ? "ok" : "falhou",
          ...(desfecho.ok
            ? {}
            : { motivo: String(desfecho.motivo ?? desfecho.etapa ?? "recusado") }),
        });
      } else {
        saida.push({ id: canal.id, provedor: canal.provider, desfecho: "nao_se_aplica" });
      }
    } catch (err) {
      saida.push({
        id: canal.id,
        provedor: canal.provider,
        desfecho: "falhou",
        // Nativa: so o status do FZAP sai (o corpo do erro pode ecoar a proxyUrl).
        motivo: canal.nativo ? resumoDoErro(err) : mensagemDe(err),
      });
    }
  }
  return saida;
}
