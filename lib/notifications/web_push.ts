import webpush from "web-push";

import { usuariosQueSilenciaram } from "@/lib/inbox/estado-por-atendente.servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { vapidPronto, vapidPublica, vapidSubject } from "./vapid";
import type { PushPayload } from "./push_payload";

export type PushSubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Dono da inscrição. Opcional: inscrição antiga pode não ter. */
  user_id?: string | null;
};

/** Opções do envio para a organização. */
export interface OpcoesDoPush {
  /**
   * A conversa da mensagem (migration 9042): quem a SILENCIOU não recebe.
   * Falha na leitura do silêncio não cala ninguém (o aviso sai como antes).
   */
  conversationId?: string | null;
}

type AdminLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: PushSubRow[] | null; error: { message: string } | null }>;
    };
    delete: () => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function store(admin: AdminLike) {
  return admin.from("push_subscriptions");
}

export async function enviarPushDaOrg(
  organizationId: string,
  payload: PushPayload,
  admin: AdminLike = createAdminClient() as unknown as AdminLike,
  opcoes: OpcoesDoPush = {},
): Promise<{ sent: number; gone: number }> {
  if (!vapidPronto()) return { sent: 0, gone: 0 };

  const { data, error } = await store(admin)
    .select("id, endpoint, p256dh, auth, user_id")
    .eq("organization_id", organizationId);
  if (error) {
    logger.warn("push_subscriptions_list_failed", { detail: error.message });
    return { sent: 0, gone: 0 };
  }
  // O MESMO client injetado (revisão do Cassio): sem abrir outro service role.
  // Qualquer falha, inclusive síncrona, não cala ninguém.
  let exceto: Set<string> | undefined;
  if (opcoes.conversationId) {
    try {
      exceto = await usuariosQueSilenciaram(
        admin as unknown as Parameters<typeof usuariosQueSilenciaram>[0],
        organizationId,
        opcoes.conversationId,
      );
    } catch {
      exceto = undefined;
    }
  }
  const rows = (data ?? []).filter((r) => !exceto || !r.user_id || !exceto.has(r.user_id));
  if (rows.length === 0) return { sent: 0, gone: 0 };

  webpush.setVapidDetails(await vapidSubject(), vapidPublica()!, env.VAPID_PRIVATE_KEY.trim());

  let sent = 0;
  let gone = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          gone += 1;
          await store(admin).delete().eq("id", row.id);
          return;
        }
        logger.warn("web_push_send_failed", { status: status ?? 0 });
      }
    }),
  );

  return { sent, gone };
}

export async function enviarPushAoUsuario(
  organizationId: string,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; gone: number }> {
  if (!vapidPronto()) return { sent: 0, gone: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (error) {
    logger.warn("push_subscriptions_user_list_failed", { detail: error.message });
    return { sent: 0, gone: 0 };
  }
  return enviarPushDaOrg(organizationId, payload, inscricoesJaFiltradas(admin, data ?? []));
}

/**
 * Push de mensagem recebida: só às inscrições de quem PODE VER a conversa.
 *
 * Quem decide é `fn_can_view_conversation` (a RLS de `conversations`), avaliada
 * para cada inscrito por `fn_push_inscricoes_que_veem_a_conversa` — a regra não
 * é repetida aqui. Falha na leitura não envia a ninguém.
 *
 * `soUsuarios` é a lista de quem DEVE ser avisado (`./destinatarios-da-mensagem.ts`);
 * ela só estreita o conjunto, nunca alarga além de quem pode ver.
 */
export async function enviarPushAQuemVeAConversa(
  organizationId: string,
  conversationId: string,
  payload: PushPayload,
  soUsuarios?: ReadonlyArray<string>,
  admin: ReturnType<typeof createAdminClient> = createAdminClient(),
): Promise<{ sent: number; gone: number }> {
  if (!vapidPronto() || soUsuarios?.length === 0) return { sent: 0, gone: 0 };
  const { data, error } = await admin.rpc("fn_push_inscricoes_que_veem_a_conversa", {
    p_org: organizationId,
    p_conversation: conversationId,
  });
  if (error) {
    logger.warn("push_subscriptions_visible_list_failed", { detail: error.message });
    return { sent: 0, gone: 0 };
  }
  // O admin client não é tipado pelo schema: a forma vem de `lib/database.types.ts`.
  const visiveis: Array<PushSubRow & { user_id: string }> = data ?? [];
  // 9042: quem silenciou a conversa não recebe. O filtro roda AQUI, com o admin
  // de verdade: o `enviarPushDaOrg` abaixo recebe a lista já filtrada, e o seu
  // `opcoes.conversationId` consultaria o client falso de `inscricoesJaFiltradas`.
  // Falha na leitura não cala ninguém (a mesma regra do `enviarPushDaOrg`).
  let silenciaram: Set<string> | undefined;
  try {
    silenciaram = await usuariosQueSilenciaram(
      admin as unknown as Parameters<typeof usuariosQueSilenciaram>[0],
      organizationId,
      conversationId,
    );
  } catch {
    silenciaram = undefined;
  }
  const linhas = visiveis.filter(
    (l) => (!soUsuarios || soUsuarios.includes(l.user_id)) && !silenciaram?.has(l.user_id),
  );
  return enviarPushDaOrg(organizationId, payload, inscricoesJaFiltradas(admin, linhas));
}

/** Lista já filtrada para `enviarPushDaOrg`; a faxina de inscrição morta (404/410) segue indo ao banco. */
function inscricoesJaFiltradas(admin: ReturnType<typeof createAdminClient>, rows: PushSubRow[]): AdminLike {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ data: rows, error: null }),
      }),
      delete: () => ({
        eq: async (col: string, val: string) => {
          const { error: delErr } = await admin.from(table).delete().eq(col, val);
          return { error: delErr };
        },
      }),
    }),
  };
}
