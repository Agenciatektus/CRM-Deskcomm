/**
 * `traduzir` LEVE: a mesma função de `dicionario.ts`, sem arrastar o dicionário
 * para o navegador de quem fala português.
 *
 * `dicionario.ts` tem ~1 MB de texto (~270 KB com gzip). Importado direto por
 * componente cliente, ele ia no JS inicial de TODA tela, inclusive para quem
 * nunca escolheu espanhol. Este módulo resolve isso assim:
 *
 * o dicionário só é baixado quando alguém pede um idioma que não é o
 * português (`carregarDicionario`, chamado pelo `IdiomaProvider`). Quem fala
 * português não baixa nada. No SERVIDOR acontece o mesmo uma vez por processo:
 * a primeira página em espanhol espera o `import()` dentro do Suspense do
 * provider, e daí em diante o dicionário fica em memória.
 *
 * Só módulo que roda no NAVEGADOR importa daqui. Código só de servidor (rota
 * de API, worker, página de servidor) continua em `dicionario.ts`, que é
 * síncrono: lá o tamanho não pesa para ninguém.
 *
 * Enquanto o dicionário não chegou, `traduzir` devolve o português, como já
 * fazia com chave sem tradução. Para essa janela não aparecer na tela, o
 * `IdiomaProvider` segura a árvore até o dicionário chegar.
 */
import type { Idioma } from "./idiomas";

type Traducoes = Record<string, Partial<Record<Exclude<Idioma, "pt-BR">, string>>>;

let carregado: Traducoes | null = null;
let pedido: Promise<void> | null = null;

/** Para quem já tem o dicionário em mãos (o setup dos testes). */
export function registrarDicionario(d: Traducoes): void {
  carregado = d;
}

/** Só para teste: volta ao estado de quem acabou de abrir a página. */
export function esquecerDicionario(): void {
  carregado = null;
  pedido = null;
}

/** O idioma já pode ser pintado sem esperar nada? */
export function dicionarioPronto(idioma: Idioma): boolean {
  return idioma === "pt-BR" || carregado !== null;
}

/** Baixa o dicionário uma vez só; chamadas seguintes reaproveitam o mesmo pedido. */
export function carregarDicionario(): Promise<void> {
  if (carregado) return Promise.resolve();
  pedido ??= import("./dicionario").then(
    (m) => {
      carregado = m.DICIONARIO;
    },
    (erro: unknown) => {
      // Falhou (rede caiu no meio): o próximo pedido tenta de novo, e até lá a
      // tela segue em português, que é o comportamento de chave sem tradução.
      pedido = null;
      throw erro;
    },
  );
  return pedido;
}

/** `traduzir("Assumir", "es")` → "Asumir". Português, ou dicionário ainda a caminho, devolve o próprio texto. */
export function traduzir(texto: string, idioma: Idioma): string {
  if (idioma === "pt-BR") return texto;
  return carregado?.[texto]?.[idioma] ?? texto;
}
