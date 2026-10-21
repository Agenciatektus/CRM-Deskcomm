/**
 * Os CABEÇALHOS que vão para o arquivo de webhook — módulo PURO. A regra do
 * corpo mora em `./enxugar-para-arquivo.ts`; esta é a mesma regra aplicada a
 * nomes e valores de header.
 */
import { credencialPeloValor } from "./credencial-pelo-valor";
import { chaveSensivel, marcador, semCredencialNaUrl, TETO_DE_TEXTO } from "./enxugar-para-arquivo";

/**
 * Cabeçalhos que NUNCA entram no arquivo, por nome exato. Além destes, sai todo
 * cabeçalho cujo nome tenha pedaço de credencial (`chaveSensivel`).
 *
 * `x-webhook-secret` é o SEGREDO COMPARTILHADO que um canal manda em claro e que
 * `lib/channels/inbound.ts` compara direto (não é HMAC): arquivado, qualquer
 * membro da org que lê o arquivo poderia forjar mensagem de entrada. `token` e
 * `apikey` são credenciais que servidores de WhatsApp mandam por header.
 */
// `asaas-access-token` (upstream, cobrança do revendedor §2.4): o Asaas autentica o
// webhook com um token ESTÁTICO no cabeçalho — é a credencial inteira.
const CABECALHOS_PROIBIDOS = ["authorization", "cookie", "x-api-key", "x-webhook-secret", "token", "apikey", "asaas-access-token"];

/**
 * LISTA PERMITIDA (21/10/2026): só entra o cabeçalho que responde a uma
 * pergunta de investigação — que formato chegou, de quem, com que assinatura,
 * qual entrega/evento. O resto (`x-forwarded-*`, `cf-*`, `accept-*`, `host`,
 * `via`, `traceparent`, `cdn-loop`…) é do proxy, não do provedor, e era ~1 KB
 * por linha × 8 mil eventos/dia, sem leitor nenhum: nenhum código lê a coluna
 * `headers`. A lista negra acima continua valendo DEPOIS desta: um nome
 * permitido com valor de credencial sai do mesmo jeito.
 */
const CABECALHOS_UTEIS = new Set(["content-type", "content-length", "content-encoding", "user-agent"]);
/** Assinatura, id de entrega, tipo de evento, carimbo de envio — de qualquer provedor. */
const PADRAO_UTIL = /signature|hmac|delivery|event|topic|request-id|idempotency|^webhook-(id|timestamp)$|^x-webhook-/;

export function cabecalhoUtil(nome: string): boolean {
  const k = nome.toLowerCase();
  return CABECALHOS_UTEIS.has(k) || PADRAO_UTIL.test(k);
}

/** O que vai para o arquivo na ESCRITA: só o útil, e sem credencial. */
export function cabecalhosParaArquivo(headers: Headers): Record<string, string> {
  const uteis = new Headers();
  headers.forEach((valor, chave) => {
    if (cabecalhoUtil(chave)) uteis.append(chave, valor);
  });
  return cabecalhosSemCredencial(uteis);
}

/**
 * Cabeçalhos sanitizados — SÓ a regra de credencial, sem a lista permitida. É
 * o que o script retroativo aplica às linhas antigas: ele existe para tirar
 * segredo, e reescrever a linha só para tirar `x-forwarded-for` seria UPDATE
 * (e TOAST reescrito) sem ganho de segurança.
 *
 * Assinatura HMAC do corpo FICA (`x-hub-signature-256` e afins): permite
 * reconferir depois se a recusa foi de assinatura ou de segredo, e é derivada
 * do corpo, não abre nada sozinha. Valor acima do teto vira marcador.
 */
export function cabecalhosSemCredencial(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((valor, chave) => {
    const k = chave.toLowerCase();
    if (CABECALHOS_PROIBIDOS.includes(k) || chaveSensivel(k) || credencialPeloValor(k, valor)) return;
    out[chave] =
      valor.length > TETO_DE_TEXTO
        ? marcador("tamanho", valor)
        : semCredencialNaUrl(valor, { cortou: false });
  });
  return out;
}
