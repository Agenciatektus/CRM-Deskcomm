/**
 * Os CABEÇALHOS que vão para o arquivo de webhook — módulo PURO. A regra do
 * corpo mora em `./enxugar-para-arquivo.ts`; esta é a mesma regra aplicada a
 * nomes e valores de header.
 */
import { credencialPeloValor } from "./credencial-pelo-valor";
import { chaveSensivel, semCredencialNaUrl, sha256, TETO_DE_TEXTO } from "./enxugar-para-arquivo";

/**
 * Cabeçalhos que NUNCA entram no arquivo, por nome exato. Além destes, sai todo
 * cabeçalho cujo nome tenha pedaço de credencial (`chaveSensivel`).
 *
 * `x-webhook-secret` é o SEGREDO COMPARTILHADO que um canal manda em claro e que
 * `lib/channels/inbound.ts` compara direto (não é HMAC): arquivado, qualquer
 * membro da org que lê o arquivo poderia forjar mensagem de entrada. `token` e
 * `apikey` são credenciais que servidores de WhatsApp mandam por header.
 */
const CABECALHOS_PROIBIDOS = ["authorization", "cookie", "x-api-key", "x-webhook-secret", "token", "apikey"];

/**
 * Cabeçalhos sanitizados.
 *
 * Assinatura HMAC do corpo FICA (`x-hub-signature-256` e afins): permite
 * reconferir depois se a recusa foi de assinatura ou de segredo, e é derivada
 * do corpo, não abre nada sozinha. Valor acima do teto vira marcador.
 */
export function cabecalhosParaArquivo(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((valor, chave) => {
    const k = chave.toLowerCase();
    if (CABECALHOS_PROIBIDOS.includes(k) || chaveSensivel(k) || credencialPeloValor(k, valor)) return;
    out[chave] =
      valor.length > TETO_DE_TEXTO
        ? `[omitido: ${valor.length} caracteres, sha256 ${sha256(valor)}]`
        : semCredencialNaUrl(valor, { cortou: false });
  });
  return out;
}
