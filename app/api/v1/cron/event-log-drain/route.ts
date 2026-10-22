/**
 * GET/POST /api/v1/cron/event-log-drain
 *
 * Cron entry point for the generic event_log drain (Task 2, spec
 * webhooks/automação 2026-07-17), scheduled by the `scheduler` service
 * (`docker/scheduler/entrypoint.sh`). Each tick drains up to 50 `pending` rows
 * whose `event_type` has a handler registered via `ensureHandlersRegistered()`
 * — `ai_agent.dispatch_requested` has no handler here: the worker's agent
 * drain is its only consumer.
 *
 * DONO ÚNICO: o laço do worker (`lib/event-log/drain-loop.ts`) é o dono dos
 * handlers. Este cron é rede de segurança e só drena quando o batimento do
 * laço no Redis está velho (> `BATIMENTO_VELHO_MS`) ou ilegível — ver
 * `lib/event-log/batimento-do-laco.ts`. Com o worker saudável, responde
 * `{ skipped: true, reason: "worker_drenando" }` sem tocar no banco.
 *
 * Auth: header `Authorization: Bearer <INTERNAL_CRON_SECRET>` (preferred) or
 * `<INTERNAL_SECRET>` (fallback), same pattern as agent-dispatcher. The
 * X-Cron-Secret header is also accepted as alias.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainEventLog } from "@/lib/event-log/drain";
import { ensureHandlersRegistered } from "@/lib/event-log/register-handlers";
import {
  criarArmazemDoBatimento,
  lerBatimento,
  workerEstaDrenando,
} from "@/lib/event-log/batimento-do-laco";
import { logger } from "@/lib/logger";
import { autorizaCron } from "@/lib/auth/cron-auth";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const armazem = criarArmazemDoBatimento();
  const batimento = armazem ? await lerBatimento(armazem) : null;
  const agora = Date.now();
  if (workerEstaDrenando(batimento, agora)) {
    return ok(
      { skipped: true, reason: "worker_drenando", batimento_idade_ms: agora - (batimento ?? agora) },
      { requestId },
    );
  }

  if (batimento !== null) {
    // Havia batimento e ele envelheceu: o laço do worker parou de drenar. É a
    // rede de segurança entrando — vale aparecer no log, não é rotina.
    logger.warn("[event-log-drain.cron] batimento do worker velho — cron assume o dreno", {
      batimento_idade_ms: agora - batimento,
      requestId,
    });
  }

  ensureHandlersRegistered();
  try {
    const summary = await drainEventLog(createAdminClient());
    return ok(summary, { requestId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[event-log-drain.cron] threw", { error: detail, requestId });
    return fail("internal_error", detail, 500, { requestId });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
