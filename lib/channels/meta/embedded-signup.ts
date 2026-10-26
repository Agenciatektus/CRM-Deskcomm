/**
 * Embedded Signup da Meta: o que o servidor faz depois que o popup devolve o `code`.
 *
 * Mora em `lib/channels/meta/` porque só a fronteira do canal fala com a Graph
 * (`pnpm lint:channels`). A rota pergunta "essa conexão presta?"; aqui se sabe como
 * responder: trocar o code por token, conferir escopo e app, registrar o número.
 *
 * Segredo: o `code` é de uso único e o token e o App Secret nunca entram em log, em erro
 * nem em resposta. Toda mensagem devolvida vem da Graph (`error.message`), nunca da
 * URL ou do corpo enviado.
 */
import { randomInt } from "node:crypto";

import { graphVersion } from "@/lib/graph-version";

import { graphBaseUrl } from "./graph-base";

export type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string };

/** O App ID público da Meta e o config_id do popup. Sem os dois a opção não existe. */
export function embeddedSignupConfigurado(
  env: Record<string, string | undefined> = process.env,
): { appId: string; configId: string; configIdCoexistencia: string } | null {
  const appId = env.META_APP_ID?.trim();
  const configId = env.META_EMBEDDED_CONFIG_ID?.trim();
  if (!appId || !configId) return null;
  return { appId, configId, configIdCoexistencia: env.META_EMBEDDED_COEX_CONFIG_ID?.trim() || configId };
}

interface ErroDaGraph {
  error?: { code?: number; type?: string; message?: string; error_subcode?: number };
}

async function chamar<T extends object>(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: true; corpo: T } | { ok: false; erro: NonNullable<ErroDaGraph["error"]>; status: number }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    const corpo = (await res.json().catch(() => ({}))) as T & ErroDaGraph;
    if (!res.ok || corpo.error) return { ok: false, erro: corpo.error ?? {}, status: res.status };
    return { ok: true, corpo };
  } catch {
    // Mensagem fixa: a de `fetch` pode carregar a URL, e a URL carrega o code e o secret.
    return { ok: false, erro: { message: "rede indisponível" }, status: 0 };
  }
}

/** Troca o `code` do popup por um token de negócio. Falha típica: code expirado ou já usado. */
export async function trocarCodePorToken(input: {
  code: string;
  appId: string;
  appSecret: string;
}): Promise<Resultado<{ token: string }>> {
  // Sem `redirect_uri`: o code do `FB.login` do SDK não amarra um redirect.
  const qs = new URLSearchParams({ client_id: input.appId, client_secret: input.appSecret, code: input.code });
  const r = await chamar<{ access_token?: string }>(`${graphBaseUrl(graphVersion())}/oauth/access_token?${qs}`);
  if (!r.ok) {
    if (r.status === 0) return { ok: false, motivo: "rede indisponível" };
    return { ok: false, motivo: "code_invalido" };
  }
  if (!r.corpo.access_token) return { ok: false, motivo: "code_invalido" };
  return { ok: true, token: r.corpo.access_token };
}

const ESCOPOS_ESPERADOS = ["whatsapp_business_management", "whatsapp_business_messaging"] as const;

/** O token é deste app, está válido e tem os escopos do WhatsApp (e a WABA, se a Meta a lista). */
export async function conferirTokenDeNegocio(input: {
  token: string;
  appId: string;
  appSecret: string;
  wabaId: string;
}): Promise<Resultado<object>> {
  const r = await chamar<{
    data?: {
      is_valid?: boolean;
      app_id?: string;
      scopes?: string[];
      granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
    };
  }>(
    `${graphBaseUrl(graphVersion())}/debug_token?${new URLSearchParams({ input_token: input.token })}`,
    { headers: { Authorization: `Bearer ${input.appId}|${input.appSecret}` } },
  );
  if (!r.ok) return { ok: false, motivo: "token_sem_escopo" };
  const d = r.corpo.data;
  if (!d || d.is_valid !== true || d.app_id !== input.appId) return { ok: false, motivo: "token_sem_escopo" };
  const escopos = new Set([...(d.scopes ?? []), ...(d.granular_scopes ?? []).map((g) => g.scope ?? "")]);
  if (!ESCOPOS_ESPERADOS.every((e) => escopos.has(e))) return { ok: false, motivo: "token_sem_escopo" };
  // Quando a Meta lista as contas do escopo, a WABA do popup tem de estar entre elas.
  const alvos = (d.granular_scopes ?? [])
    .filter((g) => g.scope === "whatsapp_business_management")
    .flatMap((g) => g.target_ids ?? []);
  if (alvos.length > 0 && !alvos.includes(input.wabaId)) return { ok: false, motivo: "token_sem_escopo" };
  return { ok: true };
}

/** A Meta recusa o PIN novo porque o número já está registrado com outro. */
const CODIGO_PIN_DIVERGENTE = 133005;

/**
 * Registra o número na Cloud API com um PIN novo. NÃO se chama em Coexistence.
 *
 * O `pin` do /register vira o PIN da verificação em duas etapas do número, e o CRM não o
 * guarda (não há campo para isso sem migration; quem precisar redefine no WhatsApp
 * Manager). Por isso o /register só roda quando é necessário: número já registrado na
 * Cloud API é PULADO, e o erro de PIN divergente (133005) é lido como "já registrado" e
 * não como falha. Sem isso, reconectar o mesmo número ficaria preso para sempre.
 */
export async function registrarNumero(input: { phoneNumberId: string; token: string }): Promise<Resultado<{ jaRegistrado: boolean }>> {
  const base = graphBaseUrl(graphVersion());
  const estado = await chamar<{ platform_type?: string; status?: string }>(
    `${base}/${input.phoneNumberId}?fields=platform_type,status`,
    { headers: { Authorization: `Bearer ${input.token}` } },
  );
  if (estado.ok && (estado.corpo.platform_type === "CLOUD_API" || estado.corpo.status === "CONNECTED")) {
    return { ok: true, jaRegistrado: true };
  }
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const r = await chamar<{ success?: boolean }>(`${base}/${input.phoneNumberId}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  if (r.ok) return { ok: true, jaRegistrado: false };
  if (r.erro.code === CODIGO_PIN_DIVERGENTE) return { ok: true, jaRegistrado: true };
  return { ok: false, motivo: /already|já est|another|outra/i.test(r.erro.message ?? "") ? "numero_em_outra_conta" : "registro_falhou" };
}
