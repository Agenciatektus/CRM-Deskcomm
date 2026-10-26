/**
 * Grava (ou ressuscita) o canal oficial da organização e registra o webhook dele.
 *
 * Um caminho só para as duas conexões: colar credenciais (`POST /channels/official`) e
 * Embedded Signup (`POST /channels/official/embedded-signup`). A rota chama a Meta para
 * VALIDAR; quem grava é esta função, para o canal sair igual de um jeito ou do outro.
 *
 * O contrato de cada passo (por que `update` e não upsert, por que o webhook só depois de
 * gravar, por que a busca não filtra `archived_at`) está comentado onde o código mora.
 */
import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { reactivateChannelSession } from "@/lib/channels/reactivate";
import { lerLimiteDoPlano, traduzirLimiteDoPlano } from "@/lib/cobranca/limites";
import type { Idioma } from "@/lib/i18n/idiomas";
import type { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { registrarWebhookDaSessao, type DesfechoDoWebhookDaSessao } from "./webhook-da-sessao";

export type FalhaAoGravar = {
  ok: false;
  status: 409 | 422 | 500;
  code: string;
  message: string;
  details?: unknown;
};

export type CanalOficialGravado = {
  ok: true;
  displayName: string;
  phoneNumber: string | null;
  webhook: DesfechoDoWebhookDaSessao | null;
};

export async function gravarCanalOficial(input: {
  admin: ReturnType<typeof createAdminClient>;
  orgId: string;
  userId: string;
  requestId: string;
  idioma: Idioma;
  t: (texto: string) => string;
  phoneNumberId: string;
  wabaId: string;
  token: string;
  /** O que a Meta devolveu ao validar o número. */
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  /** Base pública do webhook (`basePublicaDoWebhookMeta(req)`). */
  base: string;
  /** `undefined` = a conexão não diz (colar credenciais): não mexe no marcador já gravado. */
  coexistencia?: boolean;
}): Promise<CanalOficialGravado | FalhaAoGravar> {
  const { admin, orgId, requestId, t } = input;

  const cifrado = await encryptWebhookSecret(admin, input.token);
  if (!cifrado) {
    // Sem a GUC de cifra configurada, gravar o token em claro seria pior que
    // recusar. O operador precisa saber que falta uma configuração de servidor.
    return {
      ok: false,
      status: 422,
      code: "invalid_request",
      message: t("cifra indisponível nesta instalação (GUC app.nuvemshop_oauth_key ausente) — o token não foi gravado"),
    };
  }

  // A busca NÃO filtra `archived_at`: um canal oficial excluído é exatamente o
  // que este POST precisa achar para trazer de volta. Ignorá-lo criaria uma
  // SEGUNDA linha oficial na org — e a linha velha continuaria segurando o par
  // (org, número) na trava da 0106.
  const buscarExistente = (colunas: string) =>
    admin
      .from("channel_sessions")
      .select(colunas)
      .eq("organization_id", orgId)
      .eq("provider", CHANNEL_PROVIDER_META)
      .maybeSingle();
  const { data: existenteRaw } = await queryTolerantToMissingArchived(
    () => buscarExistente(`id, ${ARCHIVED_AT}, webhook_path_token, display_name, metadata`),
    () => buscarExistente("id, webhook_path_token, display_name, metadata"),
  );
  const existente = existenteRaw as {
    id: string;
    archived_at?: string | null;
    webhook_path_token?: string | null;
    display_name?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;

  const phoneNumber = input.displayPhoneNumber ? `+${input.displayPhoneNumber.replace(/\D/g, "")}` : null;
  const linha = {
    organization_id: orgId,
    provider: CHANNEL_PROVIDER_META,
    meta_phone_number_id: input.phoneNumberId,
    meta_waba_id: input.wabaId,
    meta_token_encrypted: cifrado,
    phone_number: phoneNumber,
    // O nome do provedor só batiza a conexão; depois dela o nome é do operador
    // (Renomear), e salvar a credencial de novo não o apaga. Mesma regra do
    // `coalesce(display_name, ...)` do pareamento por QR.
    display_name: existente?.display_name || (input.verifiedName ?? "Canal oficial"),
    status: "WORKING",
    // Só o Embedded Signup sabe se é Coexistence; o metadata existente é preservado.
    ...(input.coexistencia === undefined
      ? {}
      : { metadata: { ...(existente?.metadata ?? metadataInicialDoCanal()), coexistence: input.coexistencia } }),
  };

  // `update` quando já existe em vez de upsert: a trava única de (org,
  // phone_number) não serve de árbitro de `ON CONFLICT` aqui. Era DEFERRABLE
  // (medido ao criar a sessão de teste da Fase 3b, e o Postgres recusa
  // constraint deferível na inferência); a migration 0107 a trocou por um índice
  // único PARCIAL (`where archived_at is null`), que só seria inferível se a
  // cláusula repetisse o predicado — e o cliente do PostgREST não expõe isso.
  //
  // O update passa por `reactivateChannelSession` porque reconectar é
  // ressuscitar: o mesmo patch que devolve status, credencial e número tem que
  // devolver a linha à vida, ou o canal fica "conectado" na tela e excluído para
  // todo o resto do sistema.
  let idDaSessao: string | null = existente?.id ?? null;
  let webhookPathToken: string | null = existente?.webhook_path_token ?? null;
  let error: { message?: string | null } | null = null;

  if (existente) {
    ({ error } = await reactivateChannelSession(
      admin,
      { organizationId: orgId, channelSessionId: existente.id, archivedAt: existente.archived_at ?? null },
      linha,
      {
        userId: input.userId,
        requestId,
        metadata: { provider: CHANNEL_PROVIDER_META, phone_number: linha.phone_number },
      },
    ));
  } else {
    // `select("id, webhook_path_token")` porque o registro do webhook logo abaixo
    // precisa dos DOIS, e o INSERT não os devolve sozinho.
    const inserida = await admin
      .from("channel_sessions")
      .insert({
        ...linha,
        webhook_secret_encrypted: cifrado,
        metadata: { ...metadataInicialDoCanal(), ...(input.coexistencia === undefined ? {} : { coexistence: input.coexistencia }) },
      })
      .select("id, webhook_path_token")
      .maybeSingle();
    error = inserida.error;
    idDaSessao = inserida.data?.id ?? null;
    webhookPathToken = inserida.data?.webhook_path_token ?? null;
  }

  if (error) {
    // Ressuscitar ou criar o canal acima do plano: o gatilho de canais recusa (spec cobrança §5).
    const limite = traduzirLimiteDoPlano(error, input.idioma);
    if (limite) return { ok: false, status: 409, code: limite.code, message: limite.message, details: limite.details };
    return { ok: false, status: 500, code: "internal_error", message: error.message ?? "channel_session_write_failed" };
  }

  // O webhook DESTE número, registrado pela própria instalação (fatia F1). DEPOIS de
  // gravar, nunca antes: o GET de verificação da Meta chega no instante em que o
  // override é registrado e procura a sessão pelo `webhook_path_token`.
  const webhook =
    idDaSessao && webhookPathToken
      ? await registrarWebhookDaSessao({
          admin,
          channelSessionId: idDaSessao,
          phoneNumberId: input.phoneNumberId,
          wabaId: input.wabaId,
          tokenCifrado: cifrado,
          webhookPathToken,
          base: input.base,
          requestId,
        })
      : null;

  return { ok: true, displayName: linha.display_name, phoneNumber, webhook };
}

/**
 * O que pode falhar na GRAVAÇÃO, perguntado ANTES de qualquer chamada que mude estado na
 * Meta. O Embedded Signup registra o número (PIN novo que ninguém guarda); registrar e só
 * então descobrir que a cifra falta ou que o plano está cheio deixaria o número registrado
 * com um PIN desconhecido e nenhum canal.
 *
 * Melhor esforço: se a consulta em si falhar, segue (o gatilho do banco continua sendo a
 * palavra final, e o registro é idempotente: número já registrado é pulado).
 */
export async function checarGravacaoLocal(input: {
  admin: ReturnType<typeof createAdminClient>;
  orgId: string;
  idioma: Idioma;
  t: (texto: string) => string;
}): Promise<FalhaAoGravar | null> {
  const { admin, orgId, t } = input;
  if (!(await encryptWebhookSecret(admin, "sonda"))) {
    return {
      ok: false,
      status: 422,
      code: "invalid_request",
      message: t("cifra indisponível nesta instalação (GUC app.nuvemshop_oauth_key ausente) — o token não foi gravado"),
    };
  }
  try {
    const { data: ativo } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("provider", CHANNEL_PROVIDER_META)
      .is(ARCHIVED_AT, null)
      .maybeSingle();
    if (ativo) return null; // atualiza o canal que já existe: não ocupa vaga nova
    const limite = await lerLimiteDoPlano(admin, orgId, "canais");
    if (limite === null) return null;
    const { count } = await admin
      .from("channel_sessions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is(ARCHIVED_AT, null);
    if ((count ?? 0) >= limite) {
      const l = traduzirLimiteDoPlano(`limite_do_plano:canais:${limite}`, input.idioma);
      if (l) return { ok: false, status: 409, code: l.code, message: l.message, details: l.details };
    }
  } catch {
    // melhor esforço
  }
  return null;
}
