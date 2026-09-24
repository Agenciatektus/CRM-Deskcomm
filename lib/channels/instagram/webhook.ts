/**
 * Quem está entregando o evento de Instagram é mesmo quem foi autorizado?
 *
 * ─── POR QUE HMAC E NÃO O SEGREDO EM CLARO ─────────────────────────────────
 *
 * O canal irmão de WhatsApp apresenta o segredo direto num header, e ali isso é
 * defensável: o fio é o servidor de mensagens falando com este CRM, e o segredo
 * nunca sai dele. Aqui o fio é outro — uma FILA de reenvio, que processa em
 * lote, com recuo e retentativa. Ela assina o corpo, e a assinatura prova duas
 * coisas que o segredo em claro não prova: que o corpo não foi alterado no
 * caminho, e que quem enviou conhecia o segredo sem precisar transmiti-lo.
 *
 * ─── O SEGREDO É POR VÍNCULO, E É ISSO QUE IMPORTA ─────────────────────────
 *
 * Um segredo global provaria apenas "veio da plataforma", não "é para você" — e
 * um erro de roteamento entregaria o Direct de um cliente na organização de
 * outro COM ASSINATURA VÁLIDA. Com segredo por vínculo (que é o que
 * `channel_sessions.webhook_secret_encrypted` guarda), o destino errado FALHA a
 * autenticação: o bug de roteamento vira 401 em vez de vazamento entre tenants.
 *
 * ─── O CORPO É O QUE VEIO NO FIO ───────────────────────────────────────────
 *
 * A assinatura é do texto cru, exatamente como ele chegou. Re-serializar o JSON
 * antes de conferir mudaria espaços e ordem de chaves e derrubaria toda entrega
 * legítima — por isso a rota guarda o `rawBody` e é ele que chega aqui.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Formato do header: `sha256=<hex minúsculo>`. */
const PREFIXO = "sha256=";

export function verificarAssinaturaDoInstagram(
  rawBody: string,
  header: string | null,
  secret: string | null,
): boolean {
  if (!header || !secret) return false;
  if (!header.startsWith(PREFIXO)) return false;

  const recebida = header.slice(PREFIXO.length).trim().toLowerCase();
  // Hex de SHA-256 tem 64 caracteres. Conferir antes evita levar lixo ao
  // `timingSafeEqual`, que estoura quando os buffers têm tamanhos diferentes.
  if (!/^[a-f0-9]{64}$/.test(recebida)) return false;

  const esperada = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(recebida, "hex");
  const b = Buffer.from(esperada, "hex");
  if (a.length !== b.length) return false;
  // Comparação em tempo constante: `===` vazaria, pelo tempo de resposta, quantos
  // bytes iniciais o atacante acertou — e com isso a assinatura se descobre byte
  // a byte.
  return timingSafeEqual(a, b);
}
