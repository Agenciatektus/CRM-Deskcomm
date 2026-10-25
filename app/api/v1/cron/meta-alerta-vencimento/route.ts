/**
 * GET/POST /api/v1/cron/meta-alerta-vencimento — avisa os admins quando o
 * acesso à Meta vai vencer ou foi recusado (migration 9073). A regra mora em
 * `lib/plataformas-de-anuncio/meta/alerta/rodada.ts`. Diária. Não audita rodada
 * vazia (gate em tests/unit/cron-audita-so-quando-ha-efeito.test.ts).
 */
import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { enviarPushAoUsuario } from "@/lib/notifications/web_push";
import { alertarVencimentoDaMeta } from "@/lib/plataformas-de-anuncio/meta/alerta/rodada";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function executar(req: NextRequest): Promise<Response> {
  if (!autorizaCron(req)) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "cron secret inválido" } },
      { status: 401 },
    );
  }
  const resumo = await alertarVencimentoDaMeta(createAdminClient(), enviarPushAoUsuario, new Date());
  if (resumo.alertadas > 0) {
    await audit({ action: "plataformas.meta.vencimento_avisado", metadata: { ...resumo } });
  }
  return NextResponse.json({ data: resumo });
}

export const GET = executar;
export const POST = executar;
