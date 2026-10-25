/**
 * GET/POST /api/v1/cron/meta-renovar-token — troca o token longo da Meta antes de vencer.
 *
 * O "Conectar com Meta" grava um token de ~60 dias. A Meta aceita re-trocar um
 * token longo ainda válido por outro de 60 dias; sem esta rodada a conexão morre
 * calada no 60º dia.
 *
 * - Só conexões `oauth` com validade entre agora e agora + 15 dias. Token colado
 *   à mão não tem como ser renovado por nós.
 * - Falha NÃO apaga o token antigo: ele vale até vencer, e a próxima rodada tenta de novo.
 * - Idempotente: a validade nova joga a conexão para fora da janela.
 * - Grava com UPDATE CONDICIONAL (só se o token da linha ainda é o lido): colar token
 *   novo, refazer o login ou desconectar durante a rodada não é desfeito por ela.
 * - Orçamento de tempo: o scheduler corta em 60 s; a rodada para em 40 s e deixa o
 *   resto para o dia seguinte (a janela de 15 dias tolera), e a auditoria sai num `finally`.
 * - Não audita rodada vazia (gate em tests/unit/cron-audita-so-quando-ha-efeito.test.ts).
 * - Token nunca em log nem em metadata de auditoria.
 */
import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { renovarConexaoDeLeitura } from "@/lib/plataformas-de-anuncio/gravar-conexao-de-leitura";
import { logger } from "@/lib/logger";
import { configuracaoDoMetaAds } from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { renovarTokenLongo } from "@/lib/plataformas-de-anuncio/meta/oauth/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

/** Quanto à frente do vencimento a rodada já renova. */
export const JANELA_DE_RENOVACAO_MS = 15 * 24 * 60 * 60 * 1000;

/** Teto por rodada: protege a cota da Graph. */
export const TETO_POR_RODADA = 50;

/** Quanto a rodada gasta antes de parar (o scheduler corta em 60 s). */
export const ORCAMENTO_DE_TEMPO_MS = 40_000;

export interface ResumoDaRodada {
  examinadas: number;
  renovadas: number;
  falhas: number;
  /** A linha mudou durante a rodada (token novo, login refeito ou desconexão): deixada como a pessoa a pôs. */
  superadas: number;
  /** Ficaram para a próxima rodada por falta de tempo. */
  adiadas: number;
  semAppOAuth: boolean;
}

interface LinhaDeConexao {
  organization_id: string;
  access_token_encrypted: string;
}

export async function renovarTokensDaMeta(
  admin: ReturnType<typeof createAdminClient>,
  opcoes: { agora: Date },
): Promise<ResumoDaRodada> {
  const resumo: ResumoDaRodada = { examinadas: 0, renovadas: 0, falhas: 0, superadas: 0, adiadas: 0, semAppOAuth: false };
  const inicio = Date.now();

  const app = configuracaoDoMetaAds();
  if (!app) {
    resumo.semAppOAuth = true;
    return resumo;
  }

  const agora = opcoes.agora.toISOString();
  const limite = new Date(opcoes.agora.getTime() + JANELA_DE_RENOVACAO_MS).toISOString();
  const { data, error } = await admin
    .from("ad_insights_connections")
    .select("organization_id, access_token_encrypted")
    .eq("platform", "meta_ads")
    .eq("connected_via", "oauth")
    .gt("token_expires_at", agora)
    .lte("token_expires_at", limite)
    .order("token_expires_at", { ascending: true })
    .limit(TETO_POR_RODADA);
  if (error || !data) return resumo;

  const linhas = data as unknown as LinhaDeConexao[];
  /** Falha de uma conexão: nome do motivo e a organização, nunca token nem texto cru da Meta. */
  const falhou = (organizationId: string, motivo: string) => {
    resumo.falhas += 1;
    logger.warn("[meta-renovar-token] conexão não renovada; o token antigo segue valendo até vencer", {
      organization_id: organizationId,
      motivo,
    });
  };

  try {
    for (const [indice, linha] of linhas.entries()) {
      if (Date.now() - inicio > ORCAMENTO_DE_TEMPO_MS) {
        resumo.adiadas = linhas.length - indice;
        break;
      }
      resumo.examinadas += 1;

      const atual = await decryptWebhookSecret(admin, linha.access_token_encrypted);
      if (!atual) {
        falhou(linha.organization_id, "decifra_falhou");
        continue;
      }

      const leitura = await renovarTokenLongo(app, atual, { agora: opcoes.agora });
      if (!leitura.ok) {
        falhou(linha.organization_id, leitura.motivo);
        continue;
      }
      // Sem validade na resposta a linha sairia da janela para sempre (nunca mais
      // renovada nem avisada): tratada como falha, o token antigo fica.
      if (!leitura.token.expira_em) {
        falhou(linha.organization_id, "resposta_sem_validade");
        continue;
      }

      const gravado = await renovarConexaoDeLeitura(admin, {
        organizationId: linha.organization_id,
        cifraAnterior: linha.access_token_encrypted,
        accessToken: leitura.token.access_token,
        expiraEm: leitura.token.expira_em,
      });
      if (gravado.ok) resumo.renovadas += 1;
      else if (gravado.error === "superada") resumo.superadas += 1;
      else falhou(linha.organization_id, gravado.error);
    }
  } finally {
    // Num `finally`: se algo lançar no meio, quem já foi renovado continua auditado.
    if (resumo.renovadas > 0) {
      await audit({
        action: "plataformas.meta.token_renovado",
        metadata: {
          examinadas: resumo.examinadas,
          renovadas: resumo.renovadas,
          falhas: resumo.falhas,
          superadas: resumo.superadas,
          adiadas: resumo.adiadas,
        },
      });
    }
  }

  return resumo;
}

async function executar(req: NextRequest): Promise<Response> {
  if (!autorizaCron(req)) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "cron secret inválido" } }, { status: 401 });
  }
  const resumo = await renovarTokensDaMeta(createAdminClient(), { agora: new Date() });
  return NextResponse.json({ data: resumo });
}

export async function GET(req: NextRequest): Promise<Response> {
  return executar(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return executar(req);
}
