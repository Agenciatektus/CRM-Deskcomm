/**
 * Cache de 1 h da consulta de estoque ao vivo, por organização.
 *
 * ÉPOCA POR ORG: `loja-ao-vivo:{org}:epoca` é um inteiro. Toda chave de produto/busca leva a
 * época lida no INÍCIO da chamada, e a gravação usa essa mesma época. O webhook (produto ou
 * pedido) faz INCR: o que foi gravado antes, ou por uma escrita atrasada que ainda voava,
 * fica numa época morta e nunca mais é lido. Não depende de a loja disparar `product/updated`
 * para venda (a Nuvemshop não garante, e não há evento de estoque): pedido também vira a época.
 *
 * Redis fora do ar NUNCA derruba a consulta: cada ida tem teto de 2 s e qualquer falha
 * vira "sem cache" (consulta direta). Mesmo padrão de `lib/ai/rag/debounce.ts`.
 */
import { getRedis } from "@/lib/ai/rag/debounce";

export const TTL_SEGUNDOS = 3600;
const TTL_EPOCA_SEGUNDOS = 30 * 24 * 3600;
const TIMEOUT_MS = 2_000;

const chaveEpoca = (org: string) => `loja-ao-vivo:${org}:epoca`;
const chaveProduto = (org: string, epoca: number, id: string) => `loja-ao-vivo:${org}:${epoca}:p:${id}`;
export const chaveBusca = (org: string, epoca: number, termo: string, limite: number) =>
  `loja-ao-vivo:${org}:${epoca}:q:${encodeURIComponent(termo.trim().toLowerCase().replace(/\s+/g, " ")).slice(0, 120)}:${limite}`;

async function comTeto<T>(p: Promise<T>): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        t = setTimeout(() => rej(new Error("cache_timeout")), TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(t);
  }
}

export interface CacheDaBusca<P extends { id: string }> {
  ler(): Promise<P[] | null>;
  gravar(produtos: P[]): Promise<void>;
}

/** Cache de UMA busca, preso à época lida agora. Sem época legível = sem cache. */
export async function cacheDaBusca<P extends { id: string }>(
  org: string,
  termo: string,
  limite: number,
): Promise<CacheDaBusca<P>> {
  const redis = getRedis();
  let epoca = 0;
  let quebrado = !redis;
  if (redis) {
    try {
      epoca = Number(await comTeto(redis.get<number>(chaveEpoca(org)))) || 0;
    } catch {
      quebrado = true;
    }
  }
  return {
    async ler() {
      if (!redis || quebrado) return null;
      try {
        const ids = await comTeto(redis.get<string[]>(chaveBusca(org, epoca, termo, limite)));
        if (!Array.isArray(ids) || ids.length === 0) return null;
        const prods = await comTeto(redis.mget<(P | null)[]>(...ids.map((i) => chaveProduto(org, epoca, i))));
        return prods.every((p): p is P => !!p) ? prods : null;
      } catch {
        quebrado = true;
        return null;
      }
    },
    async gravar(produtos) {
      if (!redis || quebrado || produtos.length === 0) return;
      try {
        await comTeto(
          Promise.all([
            ...produtos.map((p) => redis.set(chaveProduto(org, epoca, p.id), p, { ex: TTL_SEGUNDOS })),
            redis.set(chaveBusca(org, epoca, termo, limite), produtos.map((p) => p.id), { ex: TTL_SEGUNDOS }),
          ]),
        );
      } catch {
        quebrado = true;
      }
    },
  };
}

/** Webhook de produto ou pedido: vira a época da org. Nunca lança. */
export async function invalidarLojaDaOrg(org: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await comTeto(redis.incr(chaveEpoca(org)));
    await comTeto(redis.expire(chaveEpoca(org), TTL_EPOCA_SEGUNDOS));
  } catch {
    // Sem Redis o cache não existe; o TTL cobre o resto.
  }
}
