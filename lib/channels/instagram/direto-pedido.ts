/**
 * O PEDIDO NO COOKIE: o que liga a volta do consentimento a quem clicou em "Conectar".
 *
 * ─── Por que existe ──────────────────────────────────────────────────────────
 *
 * Quem consente na Meta recebe a `conclusao` (no fragmento da URL de retorno); só quem
 * iniciou tem o `nonce`. A plataforma só fecha o pedido com os dois. Para o par ficar no
 * MESMO navegador, o `nonce` nunca vai a lugar nenhum: mora num cookie `httpOnly`, cifrado
 * (AES-256-GCM, que também autentica) com chave derivada de `INTERNAL_SECRET`. O servidor
 * só conclui se a sessão atual for a do cookie e o `pedido` da requisição for o dele.
 *
 * O cookie também carrega o endereço e o segredo do webhook do canal, que nasceram ao
 * iniciar e precisam ser gravados ao concluir. Sem tabela nova (nenhuma migration).
 *
 * Nome neutro de propósito (cerca de marca em `tests/unit/branding.test.ts`).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

export const NOME_DO_COOKIE_DO_PEDIDO = "crm_ig_pedido";
/** Só as rotas de iniciar e concluir veem o cookie. */
export const CAMINHO_DO_COOKIE_DO_PEDIDO = "/api/v1/channels/instagram";
export const VALIDADE_DO_PEDIDO_S = 10 * 60;

export interface PedidoNoCookie {
  pedidoId: string;
  nonce: string;
  userId: string;
  orgId: string;
  /** epoch ms */
  expiraEm: number;
  webhookPathToken: string;
  webhookSecret: string;
}

function chave(): Buffer {
  return createHash("sha256").update(`instagram-direto-pedido|${env.INTERNAL_SECRET}`, "utf8").digest();
}

export function lacrarPedido(p: PedidoNoCookie): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave(), iv);
  const ct = Buffer.concat([cifra.update(JSON.stringify(p), "utf8"), cifra.final()]);
  return Buffer.concat([iv, cifra.getAuthTag(), ct]).toString("base64url");
}

/** `null` para ausente, adulterado, malformado ou vencido: o chamador não distingue o motivo. */
export function abrirPedido(valor: string | undefined, agora = Date.now()): PedidoNoCookie | null {
  if (!valor) return null;
  try {
    const raw = Buffer.from(valor, "base64url");
    if (raw.length < 12 + 16 + 2) return null;
    const dec = createDecipheriv("aes-256-gcm", chave(), raw.subarray(0, 12));
    dec.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([dec.update(raw.subarray(28)), dec.final()]).toString("utf8");
    const p = JSON.parse(json) as Partial<PedidoNoCookie>;
    const textos = [p.pedidoId, p.nonce, p.userId, p.orgId, p.webhookPathToken, p.webhookSecret];
    if (!textos.every((t) => typeof t === "string" && t.length > 0)) return null;
    if (typeof p.expiraEm !== "number" || p.expiraEm < agora) return null;
    return p as PedidoNoCookie;
  } catch {
    return null;
  }
}

export function hashDoNonce(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}
