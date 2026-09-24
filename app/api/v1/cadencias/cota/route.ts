/**
 * GET /api/v1/cadencias/cota?channel_session_id=… — "Envios hoje: 84 / 150" (viewer+).
 *
 * `enviados_hoje` é CONTADO do `pacing_ledger` desde a meia-noite no fuso da
 * organização — a mesma régua que o motor usa sob o lock do número —, e não um
 * contador guardado: não há "zerar à meia-noite" que possa falhar, nem número na
 * tela que discorde do que a cadeia aplica.
 *
 * O teto de hoje é o MENOR entre o limite diário do número e o degrau de
 * aquecimento (idade do número), o mesmo `knobsView` da ficha Anti-ban: se a tela
 * mostrasse só o limite diário, o operador veria folga que o aquecimento não dá.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerEstadoDoPacing } from "@/lib/agent-engine/pacing/ledger-supabase";
import { knobsView, type ChannelKnobsRow } from "@/lib/ai/pacing-knobs";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "cadencias" });
  if (!authz.ok) return authz.response;
  const sessionId = req.nextUrl.searchParams.get("channel_session_id");
  if (!sessionId || !z.string().uuid().safeParse(sessionId).success) {
    return fail("invalid_request", "channel_session_id inválido.", 400, { requestId });
  }
  const orgId = authz.org.orgId;

  const admin = createAdminClient();
  const [{ data: sessao }, { data: org }, { data: knobs }] = await Promise.all([
    admin
      .from("channel_sessions")
      .select("id, daily_message_limit, status")
      .eq("organization_id", orgId)
      .eq("id", sessionId)
      .maybeSingle(),
    admin.from("organizations").select("timezone").eq("id", orgId).maybeSingle(),
    admin
      .from("channel_knobs")
      .select("*")
      .eq("organization_id", orgId)
      .eq("channel_session_id", sessionId)
      .maybeSingle(),
  ]);
  if (!sessao) return fail("not_found", traduzir("Número não encontrado.", authz.user.idioma), 404, { requestId });

  const agora = new Date();
  const visao = knobsView((knobs as ChannelKnobsRow | null) ?? null, agora, org?.timezone as string | null);
  const estado = await lerEstadoDoPacing(admin, orgId, sessionId, { agora, timezone: visao.effective.timezone });
  const limiteDiario = (sessao.daily_message_limit as number | null) ?? null;
  const tetoAquecimento = visao.warmup.cap_today;
  const tetoHoje = Math.min(limiteDiario ?? Infinity, tetoAquecimento ?? Infinity);

  return ok(
    {
      enviados_hoje: estado.sentToday,
      teto_hoje: Number.isFinite(tetoHoje) ? tetoHoje : null,
      limite_diario: limiteDiario,
      teto_aquecimento: tetoAquecimento,
      fuso: visao.effective.timezone,
      numero_conectado: sessao.status === "WORKING",
    },
    { requestId },
  );
}
