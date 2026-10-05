// app/api/v1/messages/[id]/media/route.ts
/**
 * GET /api/v1/messages/[id]/media — acesso autenticado à mídia da mensagem.
 * Persistida → 302 pra signed URL do bucket whatsapp-media, ESTÁVEL por bloco
 * de 30 min e com `Cache-Control: private` até o bloco virar (ver
 * `lib/messaging/media/url-assinada.ts`). A lista de mensagens já entrega essa
 * URL junto da mensagem; esta rota fica para quem não a recebeu.
 * Ainda não persistida (janela até o worker rodar) → proxy dos bytes do WAHA.
 * A URL desta rota é usada diretamente como src de <img>/<video>/<audio>
 * (cookie de sessão vai junto por ser same-origin; RLS decide o acesso).
 */
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  CHANNEL_SESSION_REF_COLUMNS,
  DEFAULT_CHANNEL_PROVIDER,
  getAdapterOpcional,
  resolveSessionRef,
  type ChannelProvider,
  type ChannelSessionRef,
} from "@/lib/channels";
import { mimeExibivel, mimeSeguroParaGuardar } from "@/lib/messaging/media/mime-seguro";
import { assinarMidias, segundosAteVirarOBloco } from "@/lib/messaging/media/url-assinada";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id: messageId } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }
  const authUser = await loadAuthUser();
  const t = (texto: string) => traduzir(texto, authUser?.idioma ?? "pt-BR");
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) {
    return fail("no_active_org", t("No active organization."), 403, { requestId });
  }

  // Client de sessão: RLS garante que a mensagem pertence a uma org do usuário.
  // Filtro explícito de organization_id por doutrina (defense-in-depth).
  const { data: msg, error } = await supabase
    .from("messages")
    .select("id, media_url, media_mime, media_storage_path, channel_session_id")
    .eq("id", messageId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (error) {
    return fail("internal_error", t("Erro ao buscar mensagem."), 500, { requestId });
  }
  if (!msg || (!msg.media_storage_path && !msg.media_url)) {
    return fail("not_found", t("Mensagem sem mídia."), 404, { requestId });
  }

  if (msg.media_storage_path) {
    const agora = Date.now();
    // O que a tela não exibe (documento, e todo mime fora de imagem sem SVG,
    // áudio, vídeo e PDF) sai como DOWNLOAD (`Content-Disposition: attachment`):
    // um HTML ou SVG guardado antes do P2-3 não abre como página.
    const urls = await assinarMidias(createAdminClient(), [msg.media_storage_path], agora, {
      // Pelo mime SEGURO (a coluna guarda o declarado, para o rótulo).
      download: !mimeExibivel(mimeSeguroParaGuardar(msg.media_mime)),
    });
    const assinada = urls.get(msg.media_storage_path);
    if (assinada) {
      const response = NextResponse.redirect(assinada, 302);
      response.headers.set("X-Request-Id", requestId);
      // `private`: dado de cliente, só o navegador de quem pediu guarda; nunca
      // borda nem cache compartilhado. `max-age` termina quando o bloco vira, e
      // a URL vale um bloco inteiro além disso. `Vary: Cookie` impede que outra
      // sessão no mesmo navegador reaproveite o redirecionamento.
      response.headers.set("Cache-Control", `private, max-age=${segundosAteVirarOBloco(agora)}`);
      response.headers.set("Vary", "Cookie");
      return response;
    }
  }

  // ── Fallback: o worker ainda não persistiu ──────────────────────────────────
  //
  // O drain é cron de minuto a minuto, então esta janela é diária: quem abre a
  // conversa antes da persistência cai aqui. O browser não alcança o transporte
  // nem tem a credencial, por isso o proxy é server-side.
  //
  // Pelo ADAPTER, não por uma função fixa. Esta era literalmente a linha que o
  // conserto do worker removeu de lá e esqueceu aqui: com `fetchWahaMedia` em
  // duro, o path de um anexo do canal intermediado era procurado dentro do
  // contêiner do canal por QR — 404, e a tela dizia "mídia indisponível".
  if (msg.media_url) {
    try {
      const admin = createAdminClient();
      const { data: sessao } = await admin
        .from("channel_sessions")
        .select(`provider, ${CHANNEL_SESSION_REF_COLUMNS}`)
        .eq("organization_id", activeOrg.orgId)
        .eq("id", msg.channel_session_id)
        .maybeSingle();

      const adapter = getAdapterOpcional(
        ((sessao?.provider as string) ?? DEFAULT_CHANNEL_PROVIDER) as ChannelProvider,
      );
      const sessionRef = sessao ? resolveSessionRef(sessao as unknown as ChannelSessionRef) : null;
      if (!adapter?.fetchInboundMedia || !sessionRef) {
        // Canal sem mídia de entrada não é defeito: é estado normal. 404 diz a
        // verdade ("não há o que servir"); 502 acusaria uma falha inexistente.
        return fail("not_found", t("Mensagem sem mídia."), 404, { requestId });
      }

      const media = await adapter.fetchInboundMedia({
        organizationId: activeOrg.orgId,
        sessionRef,
        url: msg.media_url,
        hintMime: msg.media_mime,
      });
      const exibivel = mimeExibivel(mimeSeguroParaGuardar(media.mime));
      return new Response(new Uint8Array(media.buffer), {
        status: 200,
        headers: {
          // O mime declarado pelo canal só vale se a tela o exibe; o resto sai
          // genérico, baixado, e sem o navegador adivinhar o tipo.
          "Content-Type": mimeSeguroParaGuardar(media.mime),
          ...(exibivel ? {} : { "Content-Disposition": "attachment" }),
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, max-age=60",
          "X-Request-Id": requestId,
        },
      });
    } catch {
      return fail("bad_gateway", t("Mídia indisponível no momento."), 502, { requestId });
    }
  }

  return fail("not_found", t("Mensagem sem mídia."), 404, { requestId });
}
