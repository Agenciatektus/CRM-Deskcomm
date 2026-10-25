/**
 * GET/POST /api/v1/cron/conversoes-avisa-canal — reafirma, todo dia, ao canal
 * pareado que o CRM é o dono do envio de conversões.
 *
 * O aviso vence em 48 h no lado do canal se não for reafirmado: sem esta rodada,
 * o canal voltaria a enviar as mesmas conversões em duplicidade. A porta
 * (`lib/channels/conversoes-do-canal.ts`) relê o estado e só afirma "ativo" se o
 * envio estiver saudável; conexão desligada ou doente reafirma "inativo".
 *
 * - Só organizações com conexão Meta habilitada; as paradas (suspensas) ficam de fora.
 * - Teto por rodada e orçamento de 40 s (o scheduler corta em 60 s): o que sobra
 *   fica para o dia seguinte, dentro da folga de 48 h.
 * - Não audita: o aviso é best-effort e não muda dado do cliente (gate em
 *   tests/unit/cron-audita-so-quando-ha-efeito.test.ts).
 */
import { NextResponse, type NextRequest } from "next/server";

import { autorizaCron } from "@/lib/auth/cron-auth";
import { avisarCanaisSobreConversoes } from "@/lib/channels/conversoes-do-canal";
import { logger } from "@/lib/logger";
import { idsDeOrgsParadas } from "@/lib/organizacao/operante";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Teto por rodada. */
export const TETO_POR_RODADA = 200;

/** Quanto a rodada gasta antes de parar (o scheduler corta em 60 s). */
export const ORCAMENTO_DE_TEMPO_MS = 40_000;

export interface ResumoDaRodada {
  organizacoes: number;
  avisadas: number;
  falhas: number;
  /** Ficaram para a próxima rodada por falta de tempo. */
  adiadas: number;
}

export async function reafirmarAvisosDeConversoes(
  admin: ReturnType<typeof createAdminClient>,
  avisar: typeof avisarCanaisSobreConversoes = avisarCanaisSobreConversoes,
): Promise<ResumoDaRodada> {
  const resumo: ResumoDaRodada = { organizacoes: 0, avisadas: 0, falhas: 0, adiadas: 0 };
  const inicio = Date.now();

  const { data, error } = await admin
    .from("ad_platform_connections")
    .select("organization_id")
    .eq("platform", "meta_ads")
    .eq("enabled", true)
    .order("organization_id", { ascending: true })
    .limit(TETO_POR_RODADA);
  if (error || !data) {
    logger.warn("[conversoes-avisa-canal] conexões ilegíveis; rodada vazia");
    return resumo;
  }

  const paradas = new Set(await idsDeOrgsParadas(admin));
  const orgs = (data as Array<{ organization_id: string }>)
    .map((l) => l.organization_id)
    .filter((id) => !paradas.has(id));

  for (const [indice, organizationId] of orgs.entries()) {
    if (Date.now() - inicio > ORCAMENTO_DE_TEMPO_MS) {
      resumo.adiadas = orgs.length - indice;
      break;
    }
    resumo.organizacoes += 1;
    const r = await avisar(admin, organizationId);
    resumo.avisadas += r.avisadas;
    resumo.falhas += r.falhas;
  }
  return resumo;
}

async function executar(req: NextRequest): Promise<Response> {
  if (!autorizaCron(req)) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "cron secret inválido" } },
      { status: 401 },
    );
  }
  const resumo = await reafirmarAvisosDeConversoes(createAdminClient());
  return NextResponse.json({ data: resumo });
}

export async function GET(req: NextRequest): Promise<Response> {
  return executar(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return executar(req);
}
