/**
 * Cache de 1 h da consulta de estoque ao vivo, por organização e por produto.
 *
 * Duas chaves: `p:<id>` guarda o produto já formatado; `q:<termo>:<limite>` guarda só a
 * lista de ids da busca. Assim o webhook `product/updated|deleted` apaga `p:<id>` e toda
 * busca que o continha deixa de ser hit (id sem produto = miss).
 *
 * Redis fora do ar NUNCA derruba a consulta: cada ida tem teto de 2 s e qualquer falha
 * vira "sem cache" (consulta direta). Mesmo padrão de `lib/ai/rag/debounce.ts`.
 */
import { getRedis } from "@/lib/ai/rag/debounce";

export const TTL_SEGUNDOS = 3600;
const TIMEOUT_MS = 2_000;

const chaveProduto = (org: string, id: string) => `loja-ao-vivo:${org}:p:${id}`;
const chaveBusca = (org: string, termo: string, limite: number) =>
  `loja-ao-vivo:${org}:q:${encodeURIComponent(termo.trim().toLowerCase().replace(/\s+/g, " ")).slice(0, 120)}:${limite}`;

async function comTeto<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("cache_timeout")), TIMEOUT_MS)),
  ]);
}

export interface CacheDaBusca<P extends { id: string }> {
  ler(): Promise<P[] | null>;
  gravar(produtos: P[]): Promise<void>;
}

/** Cache de UMA busca. Depois da primeira falha de Redis, o resto da chamada nem tenta. */
export function cacheDaBusca<P extends { id: string }>(
  org: string,
  termo: string,
  limite: number,
): CacheDaBusca<P> {
  let quebrado = false;
  return {
    async ler() {
      const redis = getRedis();
      if (!redis || quebrado) return null;
      try {
        const ids = await comTeto(redis.get<string[]>(chaveBusca(org, termo, limite)));
        if (!Array.isArray(ids) || ids.length === 0) return null;
        const prods = await comTeto(redis.mget<(P | null)[]>(...ids.map((i) => chaveProduto(org, i))));
        return prods.every((p): p is P => !!p) ? prods : null;
      } catch {
        quebrado = true;
        return null;
      }
    },
    async gravar(produtos) {
      const redis = getRedis();
      if (!redis || quebrado || produtos.length === 0) return;
      try {
        await comTeto(
          Promise.all([
            ...produtos.map((p) => redis.set(chaveProduto(org, p.id), p, { ex: TTL_SEGUNDOS })),
            redis.set(chaveBusca(org, termo, limite), produtos.map((p) => p.id), { ex: TTL_SEGUNDOS }),
          ]),
        );
      } catch {
        quebrado = true;
      }
    },
  };
}

/** Webhook de produto: apaga o produto do cache. Nunca lança. */
export async function invalidarProdutoDaLoja(org: string, productId: string): Promise<void> {
  const redis = getRedis();
  if (!redis || !productId) return;
  try {
    await comTeto(redis.del(chaveProduto(org, productId)));
  } catch {
    // Sem Redis o cache não existe; o TTL cobre o resto.
  }
}
