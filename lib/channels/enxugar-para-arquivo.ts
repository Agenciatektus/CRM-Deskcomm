/**
 * O QUE DO PAYLOAD NÃO ENTRA NO ARQUIVO — módulo PURO, sem banco e sem rede.
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 *
 * Medido em produção (28/09/2026): `webhook_events_log` ocupava 621 MB de um
 * banco de 689 MB, e o banco caiu ao estourar os 500 MB do plano. A causa era
 * uma chave só: o servidor de WhatsApp manda a MÍDIA INTEIRA no campo de topo
 * `base64` (além da `downloadURL`), e o arquivo gravava isso duas vezes — no
 * `raw_body` (texto) e no `payload_parsed` (jsonb).
 *
 * O mesmo payload traz no topo o campo `token`: a credencial da instância em
 * claro. Arquivo de webhook é log, e log não guarda segredo.
 *
 * ─── Por que cortar aqui, e não na ingestão ────────────────────────────────
 *
 * A ingestão recebe o corpo da REQUISIÇÃO, não do arquivo — e nem lê `base64`:
 * o anexo sai da `downloadURL` (ver `anexoDe` em `verdash/webhook.ts`). Cortar
 * na ingestão não economizaria nada no banco e arriscaria a mensagem. O arquivo
 * é o único lugar onde esses bytes viravam peso.
 *
 * ─── O que fica no lugar ────────────────────────────────────────────────────
 *
 * Um marcador, não um buraco. `base64` vira `{ omitido: true, caracteres: N }` —
 * o tamanho do TEXTO base64 (os bytes da mídia são ~3/4 disso); quem investigar
 * ainda sabe que havia mídia inline e de que tamanho era; `token`
 * vira `"[omitido]"` — sabe que o campo veio, sem ver o valor. A chave continua
 * existindo porque quem lista os CAMPOS recebidos (a tela de histórico) não
 * pode ver a lista mudar por causa disto.
 *
 * ─── O que NÃO muda ─────────────────────────────────────────────────────────
 *
 * Payload sem essas chaves sai IDÊNTICO — inclusive o `raw_body`, byte a byte,
 * para que a assinatura de quem assina o corpo continue reconferível. Só quando
 * algo foi cortado o texto é reescrito a partir do objeto enxuto. Corpo que não
 * é JSON, ou JSON que não é objeto, passa intacto: não há chave a cortar.
 *
 * Só o TOPO é olhado. É onde o campo foi medido; varrer o payload inteiro atrás
 * de nomes parecidos cortaria coisa que ninguém provou ser peso nem segredo.
 */

/** Chaves de topo cujo valor é mídia inline: some o conteúdo, fica o tamanho. */
const MIDIA_INLINE = ["base64"] as const;

/** Chaves de topo cujo valor é credencial: some o valor, fica a presença. */
const SEGREDOS = ["token"] as const;

export const TOKEN_OMITIDO = "[omitido]";

export interface ArquivoEnxuto {
  rawBody: string;
  parsed: Record<string, unknown> | null;
}

/**
 * Devolve o objeto enxuto e se algo foi cortado. Não muta a entrada.
 */
export function enxugarParaArquivo(payload: Record<string, unknown>): {
  payload: Record<string, unknown>;
  cortou: boolean;
} {
  let cortou = false;
  const out: Record<string, unknown> = { ...payload };

  for (const chave of MIDIA_INLINE) {
    const v = out[chave];
    if (typeof v === "string" && v.length > 0) {
      out[chave] = { omitido: true, caracteres: v.length };
      cortou = true;
    }
  }
  for (const chave of SEGREDOS) {
    const v = out[chave];
    if (typeof v === "string" && v.length > 0) {
      out[chave] = TOKEN_OMITIDO;
      cortou = true;
    }
  }

  return { payload: cortou ? out : payload, cortou };
}

/**
 * O par (`raw_body`, `payload_parsed`) que vai para o arquivo.
 *
 * `payload_parsed` só recebe OBJETO: lista ou escalar é JSON legítimo e não cabe
 * no formato da coluna — continua `null`, como sempre foi.
 */
export function arquivoEnxuto(rawBody: string): ArquivoEnxuto {
  let v: unknown;
  try {
    v = JSON.parse(rawBody);
  } catch {
    // Corpo que não é JSON é exatamente o que se quer arquivar inteiro.
    return { rawBody, parsed: null };
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return { rawBody, parsed: null };
  }

  const { payload, cortou } = enxugarParaArquivo(v as Record<string, unknown>);
  return {
    rawBody: cortou ? JSON.stringify(payload) : rawBody,
    parsed: payload,
  };
}
