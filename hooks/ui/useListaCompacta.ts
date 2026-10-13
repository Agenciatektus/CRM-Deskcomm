"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * O MODO COMPACTO da lista de conversas (quadro DS, `.app.compact`): a linha
 * com 8px de respiro em vez de 12 (`[data-densidade="compacta"]` em
 * `app/globals.css`). Preferência POR ATENDENTE, no mesmo padrão do menu
 * (`lib/navigation/preferencia-do-menu.ts`): UMA entrada por navegador, com o
 * id de quem gravou (`<id>:1`), sobrescrita quando outra pessoa muda; de
 * outro id, vale o padrão (lista normal). Sem tabela no banco, sem migration;
 * por isso não acompanha a pessoa entre aparelhos.
 *
 * localStorage, e não cookie: o servidor não precisa saber a densidade para
 * desenhar (a lista é do cliente), e o pior caso é um quadro na altura normal
 * antes da troca.
 */
export const CHAVE_DA_LISTA_COMPACTA = "lista_compacta";

const limparId = (id: string) => id.replace(/[^a-zA-Z0-9-]/g, "");

/** Lê o valor guardado para ESTE atendente; de outro id ou ausente, `false`. */
export function listaCompactaPara(valor: string | null, usuarioId: string | null | undefined): boolean {
  return !!usuarioId && valor === `${limparId(usuarioId)}:1`;
}

/**
 * Uma preferência compacta/normal por atendente, guardada em `chave`. A lista
 * de conversas e o card do funil (`useFunilCompacto`) usam a MESMA mecânica,
 * cada um com a sua chave: duas cópias do assinar/ler divergiriam no primeiro
 * conserto.
 *
 * `useSyncExternalStore` com servidor = `null`: o primeiro render (o do
 * servidor e o da hidratação) é sempre o padrão; o valor guardado entra no
 * render seguinte, sem divergência de hidratação.
 */
export function criarPreferenciaCompacta(chave: string) {
  const ouvintes = new Set<() => void>();

  function lerGuardado(): string | null {
    try {
      return window.localStorage.getItem(chave);
    } catch {
      // Janela anônima ou armazenamento bloqueado: segue no padrão.
      return null;
    }
  }

  function assinar(ouvir: () => void) {
    ouvintes.add(ouvir);
    // Outra aba do mesmo navegador mudou a preferência.
    const deOutraAba = (e: StorageEvent) => {
      if (e.key === chave) ouvir();
    };
    window.addEventListener("storage", deOutraAba);
    return () => {
      ouvintes.delete(ouvir);
      window.removeEventListener("storage", deOutraAba);
    };
  }

  /** `usuarioId` vem de quem chama (o `useAuth` da tela), sem nova dependência aqui. */
  return function usePreferenciaCompacta(
    usuarioId: string | null | undefined,
  ): [boolean, (ligada: boolean) => void] {
    const valor = useSyncExternalStore(assinar, lerGuardado, () => null);
    const ligada = listaCompactaPara(valor, usuarioId);
    const mudar = useCallback(
      (nova: boolean) => {
        if (!usuarioId) return;
        try {
          window.localStorage.setItem(chave, `${limparId(usuarioId)}:${nova ? 1 : 0}`);
        } catch {
          // Sem armazenamento, a escolha não persiste; a tela segue como estava.
          return;
        }
        for (const ouvir of ouvintes) ouvir();
      },
      [usuarioId],
    );
    return [ligada, mudar];
  };
}

export const useListaCompacta = criarPreferenciaCompacta(CHAVE_DA_LISTA_COMPACTA);
