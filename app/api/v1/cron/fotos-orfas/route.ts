/**
 * GET /api/v1/cron/fotos-orfas
 *
 * Remove do bucket `fotos-de-perfil` os arquivos sem dono: o perdedor de um
 * upload simultâneo, a pasta de uma conta excluída e a de uma organização
 * excluída. A regra (ponteiro decide, carência de 1 h, dúvida não apaga) mora
 * em `lib/fotos/orfas.ts`.
 *
 * Só LÊ o banco (o ponteiro) e apaga no Storage. Diária, com teto por rodada:
 * o que sobrar fica para a próxima, e a segunda rodada não acha o que a
 * primeira apagou.
 *
 * Audita a RODADA (`retention.sweep_run`) só quando apagou algo — rodada vazia
 * não é mutação (`tests/unit/cron-audita-so-quando-ha-efeito.test.ts`).
 *
 * Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET>` (fail-closed).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { limparFotosOrfas } from "@/lib/fotos/orfas";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  try {
    const r = await limparFotosOrfas(createAdminClient(), { agora: new Date() });
    if (r.removidos > 0) {
      logger.info("[fotos-orfas] fotos sem dono removidas", { request_id: requestId, ...r });
      void audit({
        action: "retention.sweep_run",
        organizationId: null,
        bypassedRls: true,
        metadata: { origem: "fotos-orfas", ...r },
        requestId,
      });
    }
    return ok(r, { requestId });
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    logger.error("[fotos-orfas] a rodada falhou", { request_id: requestId, error: erro });
    return fail("internal_error", "fotos_orfas_failed", 500, { requestId });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return GET(req);
}
