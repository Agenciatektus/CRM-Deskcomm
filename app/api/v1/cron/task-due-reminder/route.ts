/**
 * GET/POST /api/v1/cron/task-due-reminder — avisa o responsável na hora da
 * tarefa (migration 9043).
 *
 * Casca fina: a regra inteira (quais tarefas, a reivindicação sem corrida, o
 * aviso na Central e o push só para o responsável) mora em
 * `lib/tarefas/aviso-de-tarefa.ts`, onde o teste a exercita sem rede.
 *
 * Agendada a cada minuto em `docker/scheduler/entrypoint.sh`: o aviso promete
 * "na hora", e a cadência de 5 minutos da Agenda o transformaria em "até 5
 * minutos depois". Barata: a varredura usa o índice parcial
 * `crm_tasks_a_avisar_idx`, que só tem tarefa aberta, com prazo e não avisada.
 *
 * Auth: o mesmo contrato dos demais crons (`autorizaCron`, fail-closed).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { enviarPushAoUsuario } from "@/lib/notifications/web_push";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarTarefasNaHora } from "@/lib/tarefas/aviso-de-tarefa";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let resultado;
  try {
    resultado = await avisarTarefasNaHora(createAdminClient(), enviarPushAoUsuario);
  } catch (err) {
    logger.error("[task-due-reminder] rodada falhou", {
      error: err instanceof Error ? err.message : String(err),
      requestId,
    });
    return fail("internal_error", "Falha ao avisar as tarefas.", 500, { requestId });
  }

  // Rodada que não avisou ninguém NÃO é mutação e não audita (CLAUDE.md
  // §Audit log; `cron-audita-so-quando-ha-efeito.test.ts`).
  if (resultado.avisadas > 0) {
    await audit({
      action: "crm_task.aviso_enviado",
      resourceType: "crm_task",
      requestId,
      metadata: { ...resultado },
    });
  }

  return ok(resultado, { requestId });
}

export const GET = handle;
export const POST = handle;
