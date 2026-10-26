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
import { criarEnviadorDeWhatsApp, type EnviarWhatsApp } from "@/lib/plataformas-de-anuncio/meta/alerta/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function executar(req: NextRequest): Promise<Response> {
  if (!autorizaCron(req)) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "cron secret inválido" } },
      { status: 401 },
    );
  }
  const admin = createAdminClient();
  // Montado só na primeira organização que precisar avisar.
  let enviador: EnviarWhatsApp | null = null;
  const enviarWhatsApp: EnviarWhatsApp = async (org, texto) => {
    enviador ??= await criarEnviadorDeWhatsApp(admin);
    return enviador(org, texto);
  };
  const resumo = await alertarVencimentoDaMeta(admin, enviarPushAoUsuario, new Date(), enviarWhatsApp);
  if (resumo.alertadas > 0) {
    await audit({ action: "plataformas.meta.vencimento_avisado", metadata: { ...resumo, whatsapp_enviados: resumo.whatsapp.enviados, whatsapp_falhas: resumo.whatsapp.falhas } });
  }
  return NextResponse.json({ data: resumo });
}

export const GET = executar;
export const POST = executar;
