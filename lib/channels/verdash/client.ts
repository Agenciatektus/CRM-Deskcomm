/**
 * O transporte do canal Verdash — HTTP contra o FZAP, e nada além disso.
 *
 * Todo o vocabulário do provider (nome de rota, nome de campo, forma da
 * resposta) está confinado aqui e no adapter, que é o que
 * `docs/doctrine/restricao-de-canal.md` exige e o `scripts/lint-channels.ts`
 * cobra.
 *
 * ─── O contrato, MEDIDO contra o servidor real (v1.32.0) ────────────────────
 *
 * Autenticação: header `token`, com o token DA INSTÂNCIA. Confirmado no
 * `securitySchemes` do OpenAPI que o próprio servidor publica:
 *
 *     ApiKeyAuth: { type: apiKey, in: header, name: token }
 *
 * Resposta, em TODAS as rotas, no mesmo envelope:
 *
 *     { code: 200, success: true, data: { ... } }
 *
 * O `success: false` pode vir COM 200 — por isso quem lê precisa olhar os dois,
 * e não só `res.ok`. Ler apenas o status HTTP transformaria recusa do provider
 * em "enviado com sucesso", que é a falha-em-verde que a doutrina do repo
 * proíbe.
 */
import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";

import type { VerdashCredentials } from "./credentials";

/** O envelope que toda rota do FZAP devolve. */
export interface FzapEnvelope<T = unknown> {
  code?: number;
  success?: boolean;
  data?: T;
  error?: string;
}

/**
 * Teto de espera. Sem ele, um servidor que pendura a conexão pendura junto o
 * cron de saúde — e a varredura deixa de rodar para TODAS as sessões, não só
 * para a que travou.
 */
const TIMEOUT_MS = 20_000;

/**
 * Faz o pedido e devolve o envelope já validado.
 *
 * LANÇA com `verdash_...` e o motivo do provider quando a coisa dá errado: é o
 * `code`/`error` dele que distingue "número não existe no WhatsApp" de "token
 * revogado" de "instância desconectada", e sem isso o operador lê só "falhou".
 */
export async function fzapRequest<T = unknown>(
  creds: VerdashCredentials,
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown } = { method: "GET" },
): Promise<T> {
  const url = `${creds.baseUrl.replace(/\/+$/, "")}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        // O token DA INSTÂNCIA. Ver `./credentials.ts` para por que não existe
        // caminho neste arquivo que aceite o admin token do servidor.
        token: creds.token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : "erro_desconhecido";
    throw new Error(`verdash_unreachable: ${detalhe.slice(0, 200)}`);
  }

  const json = (await res.json().catch(() => null)) as FzapEnvelope<T> | null;

  if (!res.ok || json?.success === false) {
    // O `error` do provider entra no texto quando existe. NUNCA o corpo cru
    // inteiro: a resposta de `/session/status` carrega o token da instância, e
    // um erro que vaze isso para o log de aplicação desfaz o motivo de tudo
    // isto existir.
    const detalhe = json?.error ?? res.statusText ?? "";
    throw new Error(`verdash_request_failed: ${res.status} ${detalhe}`.trim());
  }

  return json?.data as T;
}

/**
 * Baixa mídia que o cliente mandou, com as guardas de saída do repo.
 *
 * A URL vem do PAYLOAD do webhook, e é payload de fora. Sem guarda, um
 * `http://169.254.169.254/...` faria o servidor buscar metadado de nuvem — e o
 * pedido leva credencial junto, então o SSRF aqui não é só "buscou o que não
 * devia": é ENTREGAR a chave ao host que o payload escolheu.
 *
 * O par é o mesmo que `lib/automation/actions/call-webhook.ts` já usa: o
 * textual recusa de graça o que dá (esquema, http em produção, IPv6 literal,
 * faixa privada) e o outro paga o DNS e julga o IP resolvido, fechando o
 * rebinding.
 *
 * EXCEÇÃO deliberada: quando a URL aponta para a própria base do FZAP, a guarda
 * de IP é dispensada. A instalação da Tektus fala com o FZAP por IP privado da
 * rede interna da VPS (é o certo: não sai para a internet), e a guarda recusa
 * faixa privada por construção. Dispensar só para o host que nós mesmos
 * configuramos no `.env` não abre o SSRF, porque esse host não vem do payload.
 */
export async function fzapFetchMedia(
  creds: VerdashCredentials,
  url: string,
): Promise<{ buffer: Buffer; mime: string }> {
  const daPropriaBase = url.startsWith(creds.baseUrl.replace(/\/+$/, ""));
  if (!daPropriaBase) {
    assertSafeOutboundUrl(url);
    await assertDestinoResolvidoSeguro(new URL(url).hostname);
  }

  const res = await fetch(url, {
    headers: { token: creds.token },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // 404 costuma ser mídia já descartada pelo servidor e 401 token — desfechos
    // diferentes, e o status é o que distingue os dois para quem investigar.
    throw new Error(`verdash_media_failed: ${res.status} ${res.statusText}`.trim());
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  // O `content-type` da resposta manda sobre a dica do webhook: é o que o
  // arquivo REALMENTE é, e é ele que vai no `contentType` do upload.
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  return { buffer, mime };
}
