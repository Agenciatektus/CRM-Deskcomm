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
 * - Não audita rodada vazia (gate em tests/unit/cron-audita-so-quando-ha-efeito.test.ts).
 * - Token nunca em log nem em metadata de auditoria.
 */
import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { gravarConexaoDeLeitura } from "@/lib/plataformas-de-anuncio/gravar-conexao-de-leitura";
import { configuracaoDoMetaAds } from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { renovarTokenLongo } from "@/lib/plataformas-de-anuncio/meta/oauth/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

/** Quanto à frente do vencimento a rodada já renova. */
export const JANELA_DE_RENOVACAO_MS = 15 * 24 * 60 * 60 * 1000;

/** Teto por rodada: protege a cota da Graph. */
export const TETO_POR_RODADA = 50;

export interface ResumoDaRodada {
  examinadas: number;
  renovadas: number;
  falhas: number;
  semAppOAuth: boolean;
}

interface LinhaDeConexao {
  organization_id: string;
  access_token_encrypted: string;
  default_account_id: string | null;
  meta_user_id: string | null;
  scopes: string[] | null;
  updated_by: string | null;
}

export async function renovarTokensDaMeta(
  admin: ReturnType<typeof createAdminClient>,
  opcoes: { agora: Date },
): Promise<ResumoDaRodada> {
  const resumo: ResumoDaRodada = { examinadas: 0, renovadas: 0, falhas: 0, semAppOAuth: false };

  const app = configuracaoDoMetaAds();
  if (!app) {
    resumo.semAppOAuth = true;
    return resumo;
  }

  const agora = opcoes.agora.toISOString();
  const limite = new Date(opcoes.agora.getTime() + JANELA_DE_RENOVACAO_MS).toISOString();
  const { data, error } = await admin
    .from("ad_insights_connections")
    .select("organization_id, access_token_encrypted, default_account_id, meta_user_id, scopes, updated_by")
    .eq("platform", "meta_ads")
    .eq("connected_via", "oauth")
    .gt("token_expires_at", agora)
    .lte("token_expires_at", limite)
    .order("token_expires_at", { ascending: true })
    .limit(TETO_POR_RODADA);
  if (error || !data) return resumo;

  for (const linha of data as unknown as LinhaDeConexao[]) {
    resumo.examinadas += 1;

    const atual = await decryptWebhookSecret(admin, linha.access_token_encrypted);
    if (!atual) {
      resumo.falhas += 1;
      continue;
    }

    const leitura = await renovarTokenLongo(app, atual, { agora: opcoes.agora });
    if (!leitura.ok) {
      resumo.falhas += 1;
      continue;
    }

    const gravado = await gravarConexaoDeLeitura(admin, {
      organizationId: linha.organization_id,
      userId: linha.updated_by,
      platform: "meta_ads",
      accessToken: leitura.token.access_token,
      oauth: {
        expiraEm: leitura.token.expira_em,
        scopes: linha.scopes,
        metaUserId: linha.meta_user_id,
      },
    });
    if (gravado.ok) resumo.renovadas += 1;
    else resumo.falhas += 1;
  }

  if (resumo.renovadas > 0) {
    await audit({
      action: "plataformas.meta.token_renovado",
      metadata: {
        examinadas: resumo.examinadas,
        renovadas: resumo.renovadas,
        falhas: resumo.falhas,
      },
    });
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
