/**
 * O CORPO VAI PARA O ARQUIVO UMA VEZ SÓ — módulo PURO, sem banco e sem rede.
 *
 * ─── O defeito, medido em produção (21/10/2026) ─────────────────────────────
 *
 * `webhook_events_log` em 556 MB, 7–9 mil eventos/dia, ~7 KB por linha. Cada
 * evento gravava o MESMO corpo duas vezes: `raw_body` (texto) e
 * `payload_parsed` (jsonb), mais os cabeçalhos. Depois do enxugamento
 * (#98/#100) não havia mais mídia nem credencial, mas a cópia dupla continuou.
 *
 * ─── Quem lê cada coluna (varrido em 21/10/2026) ───────────────────────────
 *
 * `payload_parsed`: o reprocessamento do WAHA (`reprocessar-arquivo-de-
 * webhook.ts`), o script de mídia do Instagram (`payload_parsed->>
 * provider_message_id`), a tela de fontes e a ferramenta do MCP (nomes dos
 * campos), o script retroativo de enxugamento.
 *
 * `raw_body`: NENHUM leitor no código além do script retroativo, que já trata
 * `null` (a retenção zera a coluna em D+7). A 0163 já tinha registrado o mesmo.
 *
 * Por isso fica o `payload_parsed`, e o `raw_body` só é gravado quando ele traz
 * algo que o `payload_parsed` NÃO traz:
 *
 *   - corpo que não é JSON (formulário, texto quebrado) → `payload_parsed` nulo;
 *   - lista ou escalar no topo → a coluna jsonb só recebe objeto aqui;
 *   - inteiro grande demais para o `JSON.parse` (> 2^53) → o texto é o único
 *     lugar onde o número está inteiro;
 *   - qualquer divergência entre o objeto e o corpo → na dúvida, os dois.
 *
 * O que se perde de propósito: a reconferência BYTE A BYTE de assinatura HMAC
 * a partir do arquivo. Nenhum código faz isso; o veredito da assinatura é
 * gravado na hora, em `valid_signature`, que é o que a investigação lê.
 */

/** O par de colunas que vai para o `insert`. */
export interface CorpoDoArquivo {
  raw_body: string | null;
  payload_parsed: Record<string, unknown> | null;
}

/** Inteiro com 16+ dígitos FORA de string: o `JSON.parse` pode arredondá-lo. */
const INTEIRO_GRANDE = /[:[,]\s*-?\d{16,}/;

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Igualdade de valor JSON, sem depender da ordem das chaves. */
export function mesmoValorJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => mesmoValorJson(x, b[i]));
  }
  if (ehObjeto(a) && ehObjeto(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && mesmoValorJson(a[k], b[k]));
  }
  return false;
}

/**
 * Decide o que vai para `raw_body` e `payload_parsed`.
 *
 * `rawBody` é o texto que IRIA para o arquivo (já enxuto, quando o escritor
 * enxuga); `parsed` é o objeto que iria para `payload_parsed`.
 */
export function corpoUnicoParaArquivo(
  rawBody: string,
  parsed: Record<string, unknown> | null,
): CorpoDoArquivo {
  if (!ehObjeto(parsed)) return { raw_body: rawBody, payload_parsed: null };
  if (INTEIRO_GRANDE.test(rawBody)) return { raw_body: rawBody, payload_parsed: parsed };

  let doTexto: unknown;
  try {
    doTexto = JSON.parse(rawBody);
  } catch {
    return { raw_body: rawBody, payload_parsed: parsed };
  }
  return mesmoValorJson(doTexto, parsed)
    ? { raw_body: null, payload_parsed: parsed }
    : { raw_body: rawBody, payload_parsed: parsed };
}
