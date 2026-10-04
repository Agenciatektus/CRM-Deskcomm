/**
 * URL assinada da mídia de mensagem (bucket `whatsapp-media`), ESTÁVEL por bloco
 * de tempo e assinada EM LOTE.
 *
 * ─── Por que estável ────────────────────────────────────────────────────────
 *
 * `createSignedUrl` grava o instante da assinatura no token, então a URL mudava a
 * cada pedido. Para o navegador, URL nova é arquivo novo: a mesma foto e o mesmo
 * áudio eram baixados de novo a cada vez que a conversa abria. Aqui a URL de um
 * caminho é reaproveitada enquanto o bloco de `BLOCO_S` não vira; no bloco
 * seguinte, assina-se de novo.
 *
 * A validade vai até o fim do bloco SEGUINTE ao da assinatura: entre `BLOCO_S` e
 * `2 × BLOCO_S` de vida. Quem guarda a URL em cache (o 302 da rota, com
 * `max-age` = o que falta do bloco atual) termina antes de ela vencer, com pelo
 * menos `BLOCO_S` de folga para o `<audio>`/`<video>` que toca depois de
 * carregar só os metadados.
 *
 * O cache é do processo, e não precisa ser mais que isso: ele não decide acesso.
 * Quem chama já passou pela autorização (sessão + RLS + organização) da linha de
 * onde saiu o caminho; esta função só assina o que lhe entregam.
 *
 * ─── Por que em lote ────────────────────────────────────────────────────────
 *
 * Cada mídia fazia a própria ida à rota (sessão + consultas + assinatura + 302).
 * A lista de mensagens assina todas as da página numa chamada
 * (`createSignedUrls`) e devolve a URL junto da mensagem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_DA_MIDIA = "whatsapp-media";
/**
 * 30 min: a URL vive entre 30 e 60 min (parecer do @Cassio_SecRev na #74, P2-3).
 * URL assinada é credencial ao portador; quanto menor a vida, menor o estrago de
 * um vazamento. O custo é reassinar a cada meia hora, numa chamada em lote.
 */
export const BLOCO_S = 1800;
/** Teto do cache: passou disso, recomeça (o bloco seguinte recomeçaria de qualquer jeito). */
const TETO_DO_CACHE = 20_000;

type Entrada = { bloco: number; url: string };
const cache = new Map<string, Entrada>();
let blocoDoCache = -1;

export function blocoDe(agoraMs: number): number {
  return Math.floor(agoraMs / 1000 / BLOCO_S);
}

/** Segundos até o bloco atual virar — o `max-age` coerente com a URL do bloco. */
export function segundosAteVirarOBloco(agoraMs: number): number {
  const fim = (blocoDe(agoraMs) + 1) * BLOCO_S;
  return Math.max(1, fim - Math.floor(agoraMs / 1000));
}

/** Validade a pedir ao storage: até o fim do bloco seguinte. */
export function validadeDaAssinaturaS(agoraMs: number): number {
  return segundosAteVirarOBloco(agoraMs) + BLOCO_S;
}

/** Só para teste: o cache é estado de módulo. */
export function esquecerUrlsAssinadas(): void {
  cache.clear();
  blocoDoCache = -1;
}

/**
 * Assina os caminhos, reaproveitando os do bloco atual. Devolve caminho → URL;
 * caminho que o storage recusou fica de fora (a tela cai na rota individual).
 */
export async function assinarMidias(
  admin: SupabaseClient,
  caminhos: readonly string[],
  agoraMs: number = Date.now(),
  opcoes: { download?: boolean } = {},
): Promise<Map<string, string>> {
  const bloco = blocoDe(agoraMs);
  if (bloco !== blocoDoCache || cache.size > TETO_DO_CACHE) {
    cache.clear();
    blocoDoCache = bloco;
  }

  // A URL de download (`Content-Disposition: attachment`) é OUTRA URL do mesmo
  // caminho: chave própria no cache, para uma não servir no lugar da outra.
  const chave = (caminho: string) => (opcoes.download ? `dl:${caminho}` : caminho);
  const resultado = new Map<string, string>();
  const faltam: string[] = [];
  for (const caminho of new Set(caminhos)) {
    const entrada = cache.get(chave(caminho));
    if (entrada && entrada.bloco === bloco) resultado.set(caminho, entrada.url);
    else faltam.push(caminho);
  }
  if (faltam.length === 0) return resultado;

  const { data, error } = await admin.storage
    .from(BUCKET_DA_MIDIA)
    .createSignedUrls(faltam, validadeDaAssinaturaS(agoraMs), opcoes.download ? { download: true } : undefined);
  if (error || !data) {
    console.error("[media] createSignedUrls falhou", error?.message ?? "sem dados");
    return resultado;
  }
  for (const item of data) {
    if (item.error || !item.signedUrl || !item.path) continue;
    cache.set(chave(item.path), { bloco, url: item.signedUrl });
    resultado.set(item.path, item.signedUrl);
  }
  return resultado;
}

/**
 * Anexa `media_signed_url` (e `media_thumb_signed_url`, quando a imagem tem
 * miniatura — migration 9033) às mensagens com mídia persistida. Original e
 * miniatura vão na MESMA chamada em lote. As mensagens TÊM de
 * vir de uma consulta já autorizada (cliente de sessão, RLS, organização): esta
 * função não lê nada do banco, só assina o caminho que a linha já trazia.
 */
export async function anexarUrlsDeMidia<
  M extends { media_storage_path: string | null; media_thumb_path?: string | null },
>(
  admin: SupabaseClient,
  mensagens: M[],
  agoraMs: number = Date.now(),
): Promise<Array<M & { media_signed_url: string | null; media_thumb_signed_url: string | null }>> {
  const caminhos = mensagens
    .flatMap((m) => [m.media_storage_path, m.media_thumb_path ?? null])
    .filter((c): c is string => !!c);
  const urls = caminhos.length > 0 ? await assinarMidias(admin, caminhos, agoraMs) : new Map<string, string>();
  return mensagens.map((m) => ({
    ...m,
    media_signed_url: m.media_storage_path ? (urls.get(m.media_storage_path) ?? null) : null,
    // A miniatura só vale com a original: sem a original assinada, nada de
    // mostrar a miniatura de um arquivo que a tela não consegue abrir.
    media_thumb_signed_url:
      m.media_storage_path && m.media_thumb_path && urls.has(m.media_storage_path)
        ? (urls.get(m.media_thumb_path) ?? null)
        : null,
  }));
}
