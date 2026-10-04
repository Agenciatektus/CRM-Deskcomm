/**
 * O FALLBACK DO ENRIQUECIMENTO — as redes que o Apify não achou, lidas do site.
 *
 * O `scrapeContacts` do Apify já traz e-mails e redes. Quando falta Instagram,
 * Facebook ou LinkedIn e a empresa tem site, abrimos a página inicial UMA vez e
 * procuramos os links por regex (decisão do Peterson, 02/10/2026: "os dois").
 *
 * Isto faz o NOSSO servidor abrir URL que veio de fora (o site cadastrado no
 * Maps). É SSRF por construção, então cada salto passa pelas duas guardas da
 * automação: a textual (`assertSafeOutboundUrl`: esquema, literal, faixa
 * privada, HTTPS em produção) e a do DNS (`assertDestinoResolvidoSeguro`: o IP
 * de verdade). Redirect é seguido À MÃO, até 3 saltos, revalidando cada um:
 * `redirect: "follow"` levaria um site público para `http://169.254.169.254`
 * sem passar pela guarda.
 *
 * O DNS é resolvido AQUI, por c-ares (`dns/promises.Resolver`, 2 s, uma
 * tentativa, cancelado pelo prazo do site), e não pelo `lookup` da guarda da
 * automação: `lookup` usa o threadpool do libuv (4 threads, compartilhado com
 * todo `fetch`, `fs` e crypto do Next), e um site com DNS que não responde
 * prenderia uma thread por ~10 s. O julgamento do IP continua sendo o mesmo
 * (`ipEhEspecial`). P1-A do @Cassio_SecRev na #78.
 *
 * A janela de DNS-rebinding entre esta resolução e a do `fetch` existe; o que a
 * neutraliza é o HTTPS com certificado válido (serviço interno não fala TLS com
 * o nome do atacante). Isso DEPENDE de `NODE_ENV=production` no processo que
 * roda isto (o Dockerfile do app fixa; o `Dockerfile.worker` NÃO): mover o cron
 * da prospecção para o worker sem fixar o ambiente reabre o http.
 *
 * Nunca lança e nunca segura a busca: site que falha, demora ou recusa fica
 * sem enriquecer. Roda FORA da transação que grava os candidatos.
 */
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

import { ipEhEspecial } from "@/lib/automation/outbound-ip";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";
import { logger } from "@/lib/logger";
import type { Prospect } from "./schema";

const REDES = {
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)/i,
  facebook: /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/([A-Za-z0-9_.-]+)/i,
  linkedin: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in|school)\/([A-Za-z0-9_.%-]+)/i,
} as const;
type Rede = keyof typeof REDES;

/** Caminhos que não são perfil: botão de compartilhar, login, política. */
const NAO_E_PERFIL = new Set([
  "", "home", "pages", "people", "help", "about", "policies", "policy", "legal", "privacy",
  "settings", "sharer", "sharer.php", "share.php", "tr", "profile.php", "plugins", "dialog",
  "intent", "login", "permalink.php", "p", "reel", "reels", "explore", "stories", "tv",
  "watch", "events", "groups", "marketplace", "gaming", "photo", "hashtag", "search",
]);

const TETO_DE_REDES = 15; // o mesmo de `prospectEnrichmentSchema.socials`
/**
 * Nenhuma das três redes aceita handle perto disto. Sem teto, um site hostil
 * grava uma URL de 600 caracteres, o `prospectEnrichmentSchema` (max 500)
 * recusa a linha inteira e o Inbox perde o painel de enriquecimento do lead.
 * P1-B do @Cassio_SecRev na #78.
 */
const TETO_DO_HANDLE = 100;

export interface LimitesDoSite {
  timeoutMs: number;
  maxBytes: number;
  maxSaltos: number;
}
const LIMITES_PADRAO: LimitesDoSite = { timeoutMs: 6000, maxBytes: 400_000, maxSaltos: 3 };

function redeDaUrl(url: string): Rede | null {
  for (const rede of Object.keys(REDES) as Rede[]) if (REDES[rede].test(url)) return rede;
  return null;
}

/** As redes que faltam neste prospect. Pura. */
export function redesQueFaltam(p: Pick<Prospect, "socials">): Rede[] {
  const tem = new Set(p.socials.map(redeDaUrl).filter((r): r is Rede => r !== null));
  return (Object.keys(REDES) as Rede[]).filter((r) => !tem.has(r));
}

/** O primeiro perfil de cada rede no HTML. Pura. */
export function redesDoHtml(html: string): Partial<Record<Rede, string>> {
  const achadas: Partial<Record<Rede, string>> = {};
  for (const rede of Object.keys(REDES) as Rede[]) {
    const global = new RegExp(REDES[rede].source, "gi");
    for (const m of html.matchAll(global)) {
      const handle = (m[1] ?? "").toLowerCase();
      if (handle.length > TETO_DO_HANDLE || NAO_E_PERFIL.has(handle)) continue;
      if (rede === "facebook" && (/^\d+$/.test(handle) || handle.length < 3)) continue;
      achadas[rede] = m[0];
      break;
    }
  }
  return achadas;
}

/** Site do Maps → URL que vale tentar. Sempre HTTPS: a guarda recusa http em produção. */
export function urlDoSite(website: string | null): string | null {
  if (!website) return null;
  const bruto = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  try {
    const u = new URL(bruto);
    u.protocol = "https:";
    return u.href;
  } catch {
    return null;
  }
}

/**
 * O IP de verdade do host, julgado pela mesma régua da automação. Lança
 * `unsafe_url:*` como `assertDestinoResolvidoSeguro`. Falha fechada: sem
 * resposta do DNS, recusa (inclusive nomes que só existem no /etc/hosts, que o
 * c-ares não lê, o caso de `host.docker.internal`).
 */
export async function julgarHost(hostname: string, prazo: AbortSignal): Promise<void> {
  if (isIP(hostname)) {
    if (ipEhEspecial(hostname)) throw new Error("unsafe_url:private_ip");
    return;
  }
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  const cancelar = () => resolver.cancel();
  prazo.addEventListener("abort", cancelar, { once: true });
  try {
    const [v4, v6] = await Promise.all([
      resolver.resolve4(hostname).catch(() => [] as string[]),
      resolver.resolve6(hostname).catch(() => [] as string[]),
    ]);
    if (prazo.aborted) throw new Error("unsafe_url:timeout");
    const enderecos = [...v4, ...v6];
    if (enderecos.length === 0) throw new Error("unsafe_url:dns_failed");
    if (enderecos.some(ipEhEspecial)) throw new Error("unsafe_url:private_ip");
  } finally {
    prazo.removeEventListener("abort", cancelar);
  }
}

/** GET de uma página pública, revalidando cada salto. "" em qualquer recusa ou falha. */
export async function lerPaginaPublica(url: string, limites: LimitesDoSite = LIMITES_PADRAO): Promise<string> {
  let atual = url;
  // Um prazo para o site INTEIRO, redirects incluídos: por salto, 3 saltos
  // virariam o quádruplo do teto.
  const prazo = AbortSignal.timeout(limites.timeoutMs);
  for (let salto = 0; salto <= limites.maxSaltos; salto++) {
    try {
      assertSafeOutboundUrl(atual);
      await julgarHost(new URL(atual).hostname, prazo);
      const resposta = await fetch(atual, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; VerdashCRM/1.0)" },
        signal: prazo,
      });
      if (resposta.status >= 300 && resposta.status < 400) {
        const destino = resposta.headers.get("location");
        await resposta.body?.cancel();
        if (!destino) return "";
        atual = new URL(destino, atual).href;
        continue;
      }
      if (!resposta.ok || !(resposta.headers.get("content-type") ?? "").includes("text/html")) {
        await resposta.body?.cancel();
        return "";
      }
      return await lerAteOTeto(resposta, limites.maxBytes);
    } catch (erro) {
      // Recusa da GUARDA é sinal de ataque (site do Maps apontando para a rede
      // interna) e não pode ser indistinguível de "site fora do ar". Hostname de
      // empresa não é PII. P2-A do @Cassio_SecRev na #78.
      const motivo = erro instanceof Error ? erro.message : "";
      if (motivo.startsWith("unsafe_url:") && motivo !== "unsafe_url:dns_failed") {
        logger.warn("[prospecting.enrich] site recusado pela guarda", {
          hostname: URL.canParse(atual) ? new URL(atual).hostname : null,
          motivo,
          salto,
        });
      }
      return "";
    }
  }
  return "";
}

async function lerAteOTeto(resposta: Response, maxBytes: number): Promise<string> {
  const leitor = resposta.body?.getReader();
  if (!leitor) return "";
  const pedacos: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value);
    total += value.byteLength;
  }
  await leitor.cancel().catch(() => undefined);
  const junto = new Uint8Array(Math.min(total, maxBytes));
  let pos = 0;
  for (const p of pedacos) {
    const parte = p.subarray(0, junto.length - pos);
    junto.set(parte, pos);
    pos += parte.length;
    if (pos >= junto.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(junto);
}

/**
 * Completa as redes que faltam, abrindo o site de cada prospect no máximo uma vez.
 * Muta `socials` no lugar. Nunca lança; o que não couber no orçamento fica como veio.
 */
export async function completarRedesPeloSite(
  prospects: Prospect[],
  opcoes: { concorrencia?: number; orcamentoMs?: number; ler?: (url: string) => Promise<string> } = {},
): Promise<{ tentados: number; completados: number }> {
  const concorrencia = opcoes.concorrencia ?? 6;
  const prazo = Date.now() + (opcoes.orcamentoMs ?? 30_000);
  const ler = opcoes.ler ?? ((url: string) => lerPaginaPublica(url));
  const fila = prospects.filter((p) => urlDoSite(p.website) && redesQueFaltam(p).length > 0);
  let tentados = 0;
  let completados = 0;

  async function trabalhador() {
    for (let p = fila.shift(); p; p = fila.shift()) {
      if (Date.now() >= prazo) return;
      tentados++;
      const faltam = redesQueFaltam(p);
      const achadas = redesDoHtml(await ler(urlDoSite(p.website)!));
      const novas = faltam.map((r) => achadas[r]).filter((u): u is string => Boolean(u));
      if (novas.length === 0) continue;
      p.socials = Array.from(new Set([...p.socials, ...novas])).slice(0, TETO_DE_REDES);
      completados++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, fila.length) }, trabalhador));
  return { tentados, completados };
}
