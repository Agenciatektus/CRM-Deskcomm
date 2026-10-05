import { format } from "date-fns";

import type { ThreadItem } from "@/components/inbox/ChatThread";

/**
 * As LINHAS do fio virtualizado: o que a lista de rolagem desenha, em ordem.
 *
 * Antes cada dia era um `<div>` com o rótulo `sticky` dentro e as bolhas
 * embaixo. Virtualizar exige uma lista plana — o virtualizador mede e posiciona
 * linha a linha —, então o rótulo do dia vira uma linha própria, e o botão
 * "Carregar mais antigas" também: sendo linha, quando ele some (acabou o
 * histórico) o virtualizador ancora a leitura pela chave e nada pula.
 *
 * Puro e sem I/O: testado em `tests/unit/fio-linhas.test.ts`.
 */
export type LinhaDoFio =
  | { tipo: "mais"; key: string }
  | { tipo: "dia"; key: string; data: Date }
  | { tipo: "item"; key: string; item: ThreadItem };

export function chaveDoItem(item: ThreadItem): string {
  if (item.kind === "message") return `msg-${item.data.id}`;
  if (item.kind === "note") return `note-${item.data.id}`;
  return `passagem-${item.data.id}`;
}

export function montarLinhas(items: ThreadItem[], temMais: boolean): LinhaDoFio[] {
  const linhas: LinhaDoFio[] = temMais ? [{ tipo: "mais", key: "carregar-mais" }] : [];
  let diaAnterior: string | null = null;
  for (const item of items) {
    const data = new Date(item.ts);
    const dia = format(data, "yyyy-MM-dd");
    if (dia !== diaAnterior) {
      linhas.push({ tipo: "dia", key: `dia-${dia}`, data });
      diaAnterior = dia;
    }
    linhas.push({ tipo: "item", key: chaveDoItem(item), item });
  }
  return linhas;
}

/** Índice do rótulo de dia que vale para a linha `inicio` (o último dia antes dela), ou -1. */
export function indiceDoDiaAtivo(linhas: LinhaDoFio[], inicio: number): number {
  for (let i = Math.min(inicio, linhas.length - 1); i >= 0; i--) {
    if (linhas[i]!.tipo === "dia") return i;
  }
  return -1;
}
