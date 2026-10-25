/**
 * POST /api/v1/webhooks/fzap-trafego-pago/[token]
 *
 * Gatilho de tráfego pago. O corpo NÃO é confiável e nada dele é gravado: dele só
 * saem candidatos a telefone, e a rotina de PULL (que pergunta ao canal) completa o
 * contato. A organização vem do canal dono do token, nunca do corpo.
 *
 * Token inválido, arquivado ou inexistente: o mesmo 404. Limite de corpo e de taxa
 * valem ANTES de procurar o token, para quem varre URLs não ter oráculo.
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import {
  canalDoToken,
  dispararEnriquecimento,
  TETO_DO_CORPO_BYTES,
} from "@/lib/channels/gatilho-de-trafego-pago";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NAO_ENCONTRADO = () => NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

/** Lê até o teto; `null` quando estoura. */
async function lerCorpoLimitado(req: NextRequest): Promise<string | null> {
  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > TETO_DO_CORPO_BYTES) return null;
  const leitor = req.body?.getReader();
  if (!leitor) return "";
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > TETO_DO_CORPO_BYTES) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString("utf8");
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;

  // Taxa por token (hasheado) e por IP, ANTES da busca: vale igual para token certo e errado.
  const chave = createHash("sha256").update(token ?? "").digest("hex").slice(0, 24);
  const ip = ipDoCliente(req.headers);
  const [porToken, porIp] = await Promise.all([
    checkRateLimit(`tp-push:t:${chave}`, 30, 60),
    ip ? checkRateLimit(`tp-push:ip:${ip}`, 300, 60) : Promise.resolve({ allowed: true }),
  ]);
  if (!porToken.allowed || !porIp.allowed) {
    return NextResponse.json({ error: { code: "rate_limited" } }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const texto = await lerCorpoLimitado(req);
  if (texto === null) {
    return NextResponse.json({ error: { code: "payload_too_large" } }, { status: 413 });
  }

  const admin = createAdminClient();
  const canal = await canalDoToken(admin, token);
  if (!canal) return NAO_ENCONTRADO();

  let corpo: unknown = null;
  try {
    corpo = JSON.parse(texto);
  } catch {
    // Corpo ilegível ainda é um aviso válido; sem telefone, a rotina não faz nada.
  }
  // A resposta sai já; o PULL roda depois dela.
  after(() => dispararEnriquecimento(admin, canal, corpo));
  return NextResponse.json({ data: { status: "accepted" } }, { status: 200 });
}
