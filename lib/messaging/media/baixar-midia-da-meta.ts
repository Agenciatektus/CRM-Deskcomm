/**
 * Baixar a mídia de um ponteiro assinado da Meta (anexo do Direct do Instagram)
 * SEM virar SSRF.
 *
 * A URL chega no payload do webhook — de fora. Seguir cegamente faria o worker
 * buscar o que o payload mandar, de dentro da rede do servidor. Por isso:
 *
 *  1. ALLOWLIST por sufixo de domínio da Meta, `https:` sempre. Nada de host
 *     arbitrário (mesmo raciocínio do canal oficial em `adapters/meta-cloud.ts`).
 *  2. O host é RESOLVIDO e o IP conferido (`assertDestinoResolvidoSeguro`): um
 *     nome da allowlist que resolvesse para endereço interno é recusado.
 *  3. Redirecionamento é seguido À MÃO (`redirect: "manual"`), no máximo
 *     `MAX_REDIRECIONAMENTOS`, e CADA destino passa pelas mesmas duas travas. O
 *     `lookaside` da Meta redireciona para o CDN de verdade; um redirecionamento
 *     para `169.254.169.254` ou para um serviço do compose para aqui.
 *  4. Teto de bytes: pelo `content-length` declarado E contando o que chega
 *     (o cabeçalho pode mentir ou faltar).
 *  5. A conexão vai no IP que a conferência devolveu (`fetchComDestinoFixado`):
 *     sem segunda resolução de nome, sem janela de DNS rebinding. E só a porta
 *     443 — porta fora do padrão em host da Meta não é CDN, é sondagem.
 */
import { assertDestinoResolvidoSeguro, fetchComDestinoFixado } from "@/lib/automation/outbound-ip";

export const HOSTS_DE_MIDIA_DA_META = [".fbsbx.com", ".fbcdn.net", ".cdninstagram.com"] as const;
/** 50 MB: vídeo do Direct cabe com folga; acima disso não é anexo de conversa. */
export const TETO_DE_BYTES_DA_MIDIA = 50 * 1024 * 1024;
export const MAX_REDIRECIONAMENTOS = 3;
export const USER_AGENT_DO_DOWNLOAD = "crm-media-fetch/1.0";

export interface OpcoesDoDownload {
  hintMime?: string | null;
  tetoBytes?: number;
  /** Injetáveis só para teste. */
  fetchImpl?: typeof fetch;
  conferirDestino?: (hostname: string) => Promise<void>;
}

export function hostDaMetaPermitido(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (url.port !== "" && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return HOSTS_DE_MIDIA_DA_META.some((sufixo) => host === sufixo.slice(1) || host.endsWith(sufixo));
}

async function lerComTeto(res: Response, teto: number): Promise<Buffer> {
  const declarado = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > teto) {
    throw new Error(`meta_media_too_large: ${declarado} bytes (teto ${teto})`);
  }
  if (!res.body) return Buffer.alloc(0);
  const partes: Uint8Array[] = [];
  let total = 0;
  const leitor = res.body.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > teto) {
      await leitor.cancel().catch(() => {});
      throw new Error(`meta_media_too_large: passou de ${teto} bytes`);
    }
    partes.push(value);
  }
  return Buffer.concat(partes);
}

export async function baixarMidiaDaMeta(
  urlBruta: string,
  opcoes: OpcoesDoDownload = {},
): Promise<{ buffer: Buffer; mime: string }> {
  const fetchImpl =
    opcoes.fetchImpl ??
    ((u: string, init?: RequestInit) =>
      fetchComDestinoFixado(
        u,
        { signal: init?.signal ?? undefined, headers: init?.headers as Record<string, string> | undefined },
        { portasPermitidas: [443] },
      ));
  const conferirDestino = opcoes.conferirDestino ?? assertDestinoResolvidoSeguro;
  const teto = opcoes.tetoBytes ?? TETO_DE_BYTES_DA_MIDIA;

  let url: URL;
  try {
    url = new URL(urlBruta);
  } catch {
    throw new Error("meta_media_invalid_url");
  }

  for (let salto = 0; ; salto++) {
    if (!hostDaMetaPermitido(url)) {
      throw new Error(`meta_media_host_not_allowed: ${url.protocol}//${url.hostname}`);
    }
    await conferirDestino(url.hostname);

    // Sem User-Agent o lookaside.fbsbx.com responde 302 para www.facebook.com
    // (medido em produção em 04/10/2026; com qualquer UA, inclusive "node", vem 206
    // com a mídia). O node:http da conexão fixada não manda UA nenhum.
    const res = await fetchImpl(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      headers: { "User-Agent": USER_AGENT_DO_DOWNLOAD },
    });

    if (res.status >= 300 && res.status < 400) {
      const destino = res.headers.get("location");
      if (!destino) throw new Error(`meta_media_redirect_without_location: ${res.status}`);
      if (salto >= MAX_REDIRECIONAMENTOS) throw new Error("meta_media_too_many_redirects");
      url = new URL(destino, url);
      continue;
    }
    if (!res.ok) {
      // 403/404 da Meta = ponteiro vencido ou revogado: a mídia não volta mais.
      throw new Error(`meta_media_download_failed: ${res.status}`);
    }

    const buffer = await lerComTeto(res, teto);
    const mime =
      res.headers.get("content-type")?.split(";")[0]?.trim() || opcoes.hintMime || "application/octet-stream";
    return { buffer, mime };
  }
}
