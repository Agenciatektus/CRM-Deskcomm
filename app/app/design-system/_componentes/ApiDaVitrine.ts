/**
 * A API da vitrine: as chamadas que as amostras fazem nunca saem do navegador.
 *
 * Os componentes da vitrine são os de verdade, e eles leem e gravam pela API.
 * Os testes de cada um trocam o `apiClient` por `vi.mock`; em tempo de execução
 * a troca é aqui, no `fetch`, e só para o que vem de uma amostra:
 *
 *  1. URL com o prefixo de id das amostras (`lib/design-system/amostras/ids`).
 *     Nenhum registro de verdade tem esse prefixo.
 *  2. Chamada feita DENTRO de uma consulta ou gravação do React Query da
 *     vitrine (`clienteDaVitrine`, que embrulha cada `queryFn`/`mutationFn` em
 *     `dentroDaVitrine`). O `apiClient` chama o `fetch` antes do primeiro
 *     `await`, então a marca ainda está de pé quando ele chega aqui. É isto que
 *     separa a Central de avisos da vitrine da Central do sino, que usa a
 *     MESMA rota no React Query da casca.
 *  3. A busca da paleta (Ctrl K) enquanto a paleta DA VITRINE está aberta: ela
 *     chama o `apiClient` direto, num `setTimeout`. A paleta da casca não abre
 *     ao mesmo tempo (as duas são modais).
 *
 * Todo o resto passa direto para o `fetch` original: a casca da página continua
 * falando com o servidor normalmente.
 */
import { QueryClient } from "@tanstack/react-query";

import { ehDaVitrine } from "@/lib/design-system/amostras/ids";
import { respostaDaVitrine } from "@/lib/design-system/amostras/respostas";

let profundidade = 0;
let buscaAberta = false;
let original: typeof fetch | null = null;

/** Roda `fn` com a marca de "chamada da vitrine" ligada (síncrono). */
export function dentroDaVitrine<T>(fn: () => T): T {
  profundidade += 1;
  try {
    return fn();
  } finally {
    profundidade -= 1;
  }
}

export function marcarBuscaAberta(aberta: boolean): void {
  buscaAberta = aberta;
}

function enderecoDe(entrada: RequestInfo | URL): string {
  if (typeof entrada === "string") return entrada;
  if (entrada instanceof URL) return entrada.href;
  return entrada.url;
}

const BUSCA_DA_PALETA = /\/api\/v1\/(conversations|contacts|leads)\?/;

export function ehChamadaDaVitrine(endereco: string): boolean {
  if (profundidade > 0) return true;
  if (ehDaVitrine(endereco)) return true;
  return buscaAberta && BUSCA_DA_PALETA.test(endereco);
}

/** Liga o desvio (idempotente). Devolve a função que desliga. */
export function instalarApiDaVitrine(): () => void {
  if (typeof window === "undefined" || original) return () => undefined;
  const real = globalThis.fetch.bind(globalThis);
  original = real;
  globalThis.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const endereco = enderecoDe(entrada);
    if (!ehChamadaDaVitrine(endereco)) return real(entrada, init);
    const metodo = init?.method ?? (entrada instanceof Request ? entrada.method : "GET");
    const corpo = JSON.stringify(respostaDaVitrine(metodo, endereco, Date.now()));
    return Promise.resolve(new Response(corpo, { status: 200, headers: { "Content-Type": "application/json" } }));
  };
  return () => {
    if (original) globalThis.fetch = original;
    original = null;
    buscaAberta = false;
  };
}

function embrulhar<F>(fn: F): F {
  if (typeof fn !== "function") return fn;
  return ((...args: unknown[]) => dentroDaVitrine(() => (fn as (...a: unknown[]) => unknown)(...args))) as F;
}

/**
 * Um React Query só da vitrine. Cada consulta e gravação dele roda marcada
 * (item 2 acima), sem nova tentativa e sem releitura periódica: a amostra é
 * fixa, e a Central de avisos, que relê a cada 30 s, não precisa disso aqui.
 */
export function clienteDaVitrine(): QueryClient {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const consulta = cliente.defaultQueryOptions.bind(cliente);
  cliente.defaultQueryOptions = ((opcoes: Parameters<typeof consulta>[0]) => {
    const base = consulta(opcoes);
    return { ...base, queryFn: embrulhar(base.queryFn), refetchInterval: false, retry: false };
  }) as typeof cliente.defaultQueryOptions;
  const gravacao = cliente.defaultMutationOptions.bind(cliente);
  cliente.defaultMutationOptions = ((opcoes: Parameters<typeof gravacao>[0]) => {
    const base = gravacao(opcoes);
    return { ...base, mutationFn: embrulhar(base.mutationFn), retry: false };
  }) as typeof cliente.defaultMutationOptions;
  return cliente;
}
