/**
 * GET/POST /api/v1/cron/conversoes-avisa-canal — reafirma, todo dia, ao canal
 * pareado que o CRM é o dono do envio de conversões.
 *
 * O aviso vence em 48 h no lado do canal se não for reafirmado: sem esta rodada,
 * o canal voltaria a enviar as mesmas conversões em duplicidade. A porta
 * (`lib/channels/conversoes-do-canal.ts`) relê o estado e só afirma "ativo" se o
 * envio estiver saudável; conexão desligada ou doente reafirma "inativo".
 *
 * - TODAS as conexões Meta (ligadas ou não) e também as organizações paradas: o
 *   canal só volta a enviar se ouvir "inativo", e a porta já devolve inativo para a
 *   conexão desligada; a parada recebe "inativo" forçado.
 * - Páginas por cursor (organization_id) a partir de um ponto que gira com o dia, até
 *   acabar o orçamento de 40 s (o scheduler corta em 60 s): o que sobra fica para o
 *   dia seguinte, dentro da folga de 48 h, e o `adiadas` vai no log.
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

/** Ponto de partida do dia: o orçamento curto não serve sempre as mesmas organizações. */
function inicioDoDia(agora: number): string {
  const dia = Math.floor(agora / 86_400_000);
  return `${(dia % 16).toString(16)}0000000-0000-0000-0000-000000000000`;
}

export async function reafirmarAvisosDeConversoes(
  admin: ReturnType<typeof createAdminClient>,
  avisar: typeof avisarCanaisSobreConversoes = avisarCanaisSobreConversoes,
): Promise<ResumoDaRodada> {
  const resumo: ResumoDaRodada = { organizacoes: 0, avisadas: 0, falhas: 0, adiadas: 0 };
  const inicio = Date.now();
  const prazoFinal = inicio + ORCAMENTO_DE_TEMPO_MS;

  // Parada não opera: o CRM não envia, então o canal precisa ouvir "inativo" e voltar a enviar.
  // Se a lista falhar, na dúvida todas ouvem "inativo": duplicar é o lado seguro, calar não.
  let paradas = new Set<string>();
  let paradasIlegiveis = false;
  try {
    paradas = new Set(await idsDeOrgsParadas(admin));
  } catch (err) {
    paradasIlegiveis = true;
    logger.warn("[conversoes-avisa-canal] orgs paradas ilegíveis; todas ouvem inativo", {
      motivo: err instanceof Error ? err.message.slice(0, 120) : "desconhecido",
    });
  }

  const partida = inicioDoDia(inicio);
  // Duas fases para dar a volta no ciclo: depois de `partida` até o fim, e do começo até `partida`.
  for (const fase of ["depois", "antes"] as const) {
    let cursor: string | null = fase === "depois" ? partida : null;
    for (;;) {
      let consulta = admin
        .from("ad_platform_connections")
        .select("organization_id")
        .eq("platform", "meta_ads");
      if (cursor) consulta = consulta.gt("organization_id", cursor);
      if (fase === "antes") consulta = consulta.lte("organization_id", partida);
      const { data, error } = await consulta
        .order("organization_id", { ascending: true })
        .limit(TETO_POR_RODADA);
      if (error || !data) {
        logger.warn("[conversoes-avisa-canal] conexões ilegíveis; rodada interrompida", { fase });
        return resumo;
      }
      const orgs = (data as Array<{ organization_id: string }>).map((l) => l.organization_id);

      for (const [indice, organizationId] of orgs.entries()) {
        if (Date.now() > prazoFinal) {
          resumo.adiadas += orgs.length - indice;
          logger.warn("[conversoes-avisa-canal] orçamento esgotado; organizações adiadas", {
            adiadas: resumo.adiadas,
          });
          return resumo;
        }
        resumo.organizacoes += 1;
        const r = await avisar(admin, organizationId, {
          forcarInativo: paradasIlegiveis || paradas.has(organizationId),
          prazoFinal,
        });
        resumo.avisadas += r.avisadas;
        resumo.falhas += r.falhas;
      }

      if (orgs.length < TETO_POR_RODADA) break;
      cursor = orgs[orgs.length - 1]!;
    }
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
