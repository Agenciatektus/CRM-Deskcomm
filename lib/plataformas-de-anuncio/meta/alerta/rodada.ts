/**
 * A rodada diária que avisa os admins do vencimento (ou da recusa) do acesso à
 * Meta. Canais que o CRM já tem: sino da Central (`agent_inbox_items`), push do
 * navegador (`enviarPushAoUsuario`) e e-mail (`sendEmail` do roteador).
 *
 * Dedup por INSERT em `meta_alertas_enviados` (único organização+marco+janela):
 * o INSERT é o cadeado, sem check-then-act. Perder um aviso depois do claim é
 * preferível a mandar dois. Destinatários: admins ativos da organização, SEM
 * quem é platform admin (suporte da plataforma).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { marcaDaSaida } from "@/lib/branding/saida";
import { sendEmail } from "@/lib/email/roteador";
import { buildEmailDoAlertaMeta } from "@/lib/email/templates/alerta-meta";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma, type Idioma } from "@/lib/i18n/idiomas";
import { logger } from "@/lib/logger";
import type { PushPayload } from "@/lib/notifications/push_payload";
import { ehOperante, STATUS_OPERANTE, statusDaOrgEmbutida } from "@/lib/organizacao/operante";

import { pendenciaDaConexao } from "./marcos";
import { textoDoAlerta, textoDoWhatsApp } from "./texto";
import type { EnviarWhatsApp } from "./whatsapp";

export const TETO_POR_RODADA = 200;
export const ORCAMENTO_DE_TEMPO_MS = 40_000;
/** O primeiro marco (d7) cai a 7 dias; vencidos entram por `lte`. */
const JANELA_DO_ALERTA_MS = 7 * 24 * 60 * 60 * 1000;
/** Teto do envio por WhatsApp: transporte pendurado não come o orçamento da rodada. */
export const PRAZO_DO_WHATSAPP_MS = 10_000;
const LINK = "/app/settings/meta-ads";

export type EnviarPush = (org: string, userId: string, payload: PushPayload) => Promise<unknown>;

export interface ResumoDoAlerta {
  examinadas: number;
  alertadas: number;
  semDestinatario: number;
  adiadas: number;
  /** A consulta devolveu o teto: pode haver mais conexões na janela. */
  truncada: boolean;
  whatsapp: { enviados: number; falhas: number };
}

interface Linha {
  organization_id: string;
  token_expires_at: string | null;
  needs_reconnect: boolean;
  needs_reconnect_desde: string | null;
  organizations?: Parameters<typeof statusDaOrgEmbutida>[0];
}

/** Admins ativos sem o suporte da plataforma; `null` se a leitura falhou (não avisa, não reivindica). */
async function destinatarios(db: SupabaseClient, org: string): Promise<string[] | null> {
  const { data: vinculos, error: erroVinculos } = await db
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", org)
    .eq("role", "admin")
    .is("revoked_at", null);
  if (erroVinculos) {
    logger.warn("[meta-alerta-vencimento] vínculos ilegíveis", { organization_id: org, code: erroVinculos.code ?? "sem_codigo" });
    return null;
  }
  const ids = ((vinculos ?? []) as Array<{ user_id: string }>).map((v) => v.user_id);
  if (ids.length === 0) return [];
  const { data: suporte, error: erroSuporte } = await db
    .from("platform_admins")
    .select("user_id")
    .in("user_id", ids)
    .is("revoked_at", null);
  if (erroSuporte) {
    logger.warn("[meta-alerta-vencimento] platform_admins ilegível", { organization_id: org, code: erroSuporte.code ?? "sem_codigo" });
    return null;
  }
  const fora = new Set(((suporte ?? []) as Array<{ user_id: string }>).map((s) => s.user_id));
  return ids.filter((id) => !fora.has(id));
}

export async function alertarVencimentoDaMeta(
  db: SupabaseClient,
  enviarPush: EnviarPush,
  agora: Date = new Date(),
  enviarWhatsApp?: EnviarWhatsApp,
): Promise<ResumoDoAlerta> {
  const resumo: ResumoDoAlerta = {
    examinadas: 0,
    alertadas: 0,
    semDestinatario: 0,
    adiadas: 0,
    truncada: false,
    whatsapp: { enviados: 0, falhas: 0 },
  };
  const inicio = Date.now();
  const { data, error } = await db
    .from("ad_insights_connections")
    .select(
      "organization_id, token_expires_at, needs_reconnect, needs_reconnect_desde, organizations:organization_id!inner(status)",
    )
    .eq("platform", "meta_ads")
    .eq("organizations.status", STATUS_OPERANTE)
    .or(`needs_reconnect.eq.true,token_expires_at.lte.${new Date(agora.getTime() + JANELA_DO_ALERTA_MS).toISOString()}`)
    .order("organization_id", { ascending: true })
    .limit(TETO_POR_RODADA);
  if (error || !data) return resumo;
  const linhas = data as unknown as Linha[];
  if (linhas.length === TETO_POR_RODADA) {
    resumo.truncada = true;
    logger.warn("[meta-alerta-vencimento] a consulta bateu o teto; pode haver conexões na janela sem aviso", {
      teto: TETO_POR_RODADA,
    });
  }

  for (const [i, linha] of linhas.entries()) {
    if (Date.now() - inicio > ORCAMENTO_DE_TEMPO_MS) {
      resumo.adiadas = linhas.length - i;
      break;
    }
    resumo.examinadas += 1;
    if (!ehOperante(statusDaOrgEmbutida(linha.organizations))) continue;
    const pendencia = pendenciaDaConexao(linha, agora);
    if (!pendencia) continue;
    const org = linha.organization_id;

    try {
      const alvos = await destinatarios(db, org);
      if (alvos === null) continue;
      if (alvos.length === 0) {
        resumo.semDestinatario += 1;
        continue;
      }
      // O claim: só quem cria a linha avisa.
      const { data: claim, error: erroClaim } = await db
        .from("meta_alertas_enviados")
        .insert({ organization_id: org, marco: pendencia.marco, janela: pendencia.janela })
        .select("id")
        .maybeSingle();
      if (erroClaim) {
        if (erroClaim.code !== "23505") {
          logger.error("[meta-alerta-vencimento] claim falhou", {
            organization_id: org,
            code: erroClaim.code,
          });
        }
        continue;
      }
      if (!claim) continue;
      resumo.alertadas += 1;

      const { data: o } = await db.from("organizations").select("locale").eq("id", org).maybeSingle();
      const idioma: Idioma = normalizarIdioma((o as { locale?: string | null } | null)?.locale ?? null);
      const texto = textoDoAlerta(pendencia, idioma);

      const { error: erroSino } = await db.from("agent_inbox_items").insert({
        organization_id: org,
        kind: "other",
        severity: "warn",
        title: texto.titulo,
        body: texto.corpo,
      });
      if (erroSino) logger.warn("[meta-alerta-vencimento] sino falhou", { organization_id: org });

      const marca = await marcaDaSaida(org);
      const base = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
      const email = buildEmailDoAlertaMeta({
        titulo: texto.titulo,
        corpo: texto.corpo,
        marca,
        botao: { rotulo: traduzir("Reconectar com Meta", idioma), href: `${base}${LINK}` },
        rodape: traduzir("Você recebe este aviso porque administra esta empresa.", idioma),
        idioma,
      });
      // O WhatsApp da equipe é independente: falha dele não toca sino, push nem e-mail.
      if (enviarWhatsApp) {
        let relogio: ReturnType<typeof setTimeout> | undefined;
        const desfecho = await Promise.race([
          enviarWhatsApp(org, textoDoWhatsApp(pendencia, marca.nome, idioma)),
          new Promise<"falhou:timeout">((resolve) => {
            relogio = setTimeout(() => resolve("falhou:timeout"), PRAZO_DO_WHATSAPP_MS);
          }),
        ])
          .catch((): "falhou:erro_no_envio" => "falhou:erro_no_envio")
          .finally(() => clearTimeout(relogio));
        if (desfecho === "enviado") resumo.whatsapp.enviados += 1;
        else if (desfecho !== "ignorado") {
          resumo.whatsapp.falhas += 1;
          logger.warn("[meta-alerta-vencimento] WhatsApp não enviado", { organization_id: org, motivo: desfecho });
        }
      }
      for (const userId of alvos) {
        if (Date.now() - inicio > ORCAMENTO_DE_TEMPO_MS) {
          logger.warn("[meta-alerta-vencimento] orçamento de tempo esgotado no meio dos destinatários", {
            organization_id: org,
          });
          break;
        }
        try {
          await enviarPush(org, userId, {
            title: texto.titulo,
            body: texto.corpo,
            tag: `meta-alerta:${pendencia.janela}`,
            href: LINK,
          });
        } catch {
          logger.warn("[meta-alerta-vencimento] push falhou", { organization_id: org });
        }
        try {
          const { data: u } = await db.auth.admin.getUserById(userId);
          const para = u?.user?.email;
          if (para) {
            const r = await sendEmail({
              to: para,
              subject: email.subject,
              html: email.html,
              text: email.text,
              fromName: marca.nome,
              tags: [{ name: "tipo", value: "meta-alerta" }],
            });
            if (!r.ok) {
              logger.warn("[meta-alerta-vencimento] e-mail não saiu", {
                organization_id: org,
                erro: r.error ?? "desconhecido",
              });
            }
          }
        } catch {
          logger.warn("[meta-alerta-vencimento] e-mail falhou", { organization_id: org });
        }
      }
    } catch {
      logger.warn("[meta-alerta-vencimento] conexão não avisada", { organization_id: org });
    }
  }
  return resumo;
}
