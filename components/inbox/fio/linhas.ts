import { format } from "date-fns";

import type { ThreadItem } from "@/components/inbox/ChatThread";
import type { Message } from "@/lib/types/messaging";

/**
 * As LINHAS do fio virtualizado: o que a lista de rolagem desenha, em ordem.
 *
 * Antes cada dia era um `<div>` com o rótulo `sticky` dentro e as bolhas
 * embaixo. Virtualizar exige uma lista plana — o virtualizador mede e posiciona
 * linha a linha —, então o rótulo do dia vira uma linha própria, e o botão
 * "Carregar mais antigas" também: sendo linha, quando ele some (acabou o
 * histórico) o virtualizador ancora a leitura pela chave e nada pula.
 *
 * O divisor "Novas mensagens" é linha pelo mesmo motivo: ele é medido como as
 * outras, e a chave fixa faz o virtualizador tratá-lo como uma linha só quando
 * entra ou sai, sem recalcular a posição das bolhas pelo índice.
 *
 * Puro e sem I/O: testado em `tests/unit/fio-linhas.test.ts`.
 */
export type LinhaDoFio =
  | { tipo: "mais"; key: string }
  | { tipo: "dia"; key: string; data: Date }
  | { tipo: "novas"; key: string }
  | { tipo: "item"; key: string; item: ThreadItem };

export function chaveDoItem(item: ThreadItem): string {
  if (item.kind === "message") return `msg-${item.data.id}`;
  if (item.kind === "note") return `note-${item.data.id}`;
  return `passagem-${item.data.id}`;
}

export function montarLinhas(
  items: ThreadItem[],
  temMais: boolean,
  // Opcional porque o fio sem leitura pendente (o caso comum) não tem divisor.
  idDaPrimeiraNaoLida: string | null = null,
): LinhaDoFio[] {
  const linhas: LinhaDoFio[] = temMais ? [{ tipo: "mais", key: "carregar-mais" }] : [];
  let diaAnterior: string | null = null;
  for (const item of items) {
    const data = new Date(item.ts);
    const dia = format(data, "yyyy-MM-dd");
    if (dia !== diaAnterior) {
      linhas.push({ tipo: "dia", key: `dia-${dia}`, data });
      diaAnterior = dia;
    }
    // Depois do rótulo do dia, não antes: a primeira não lida que abre um dia
    // novo lê "Hoje" e então "Novas mensagens", na ordem em que o olho procura.
    if (idDaPrimeiraNaoLida && item.kind === "message" && item.data.id === idDaPrimeiraNaoLida) {
      linhas.push({ tipo: "novas", key: "novas-mensagens" });
    }
    linhas.push({ tipo: "item", key: chaveDoItem(item), item });
  }
  return linhas;
}

/**
 * Qual mensagem abre as não lidas: a N-ésima RECEBIDA contando do fim.
 *
 * O banco só sabe QUANTAS (`unread_count_for_assignee`), não quais; e quem
 * conta são as mensagens do cliente, então a nossa resposta no meio não entra
 * na conta. Se o número passa do que está carregado, o divisor fica na mais
 * antiga recebida da página: melhor um divisor um pouco abaixo do certo que
 * nenhum.
 */
export function primeiraNaoLida(items: ThreadItem[], naoLidas: number): string | null {
  if (!(naoLidas > 0)) return null;
  let restantes = naoLidas;
  let achada: string | null = null;
  for (let i = items.length - 1; i >= 0 && restantes > 0; i--) {
    const it = items[i]!;
    if (it.kind !== "message" || it.data.direction === "outbound") continue;
    achada = it.data.id;
    restantes--;
  }
  return achada;
}

/** Índice do rótulo de dia que vale para a linha `inicio` (o último dia antes dela), ou -1. */
export function indiceDoDiaAtivo(linhas: LinhaDoFio[], inicio: number): number {
  for (let i = Math.min(inicio, linhas.length - 1); i >= 0; i--) {
    if (linhas[i]!.tipo === "dia") return i;
  }
  return -1;
}

/** Até quanto tempo entre duas falas do mesmo autor elas ainda são um bloco só. */
const JANELA_DO_BLOCO_MS = 5 * 60 * 1000;

/**
 * Quem falou, para agrupar. Duas recebidas num GRUPO de WhatsApp podem ser de
 * pessoas diferentes, então o remetente entra na chave; duas enviadas só são
 * do mesmo bloco se saíram do mesmo canal de autoria (IA, pessoa, celular…) e,
 * quando é pessoa, da mesma pessoa. A fala "em nome de" (#1613) sai pelo
 * mesmo token com pessoas diferentes por trás, e o nome acima da bolha é o
 * dessa pessoa: sem ela na chave, a fala de Ana herdaria o nome de Bruno.
 */
function autorDa(m: Message): string {
  if (m.direction !== "outbound") return `in:${JSON.stringify(m.metadata?.group_sender ?? null)}`;
  return `out:${m.sent_via}:${m.sent_by_user_id ?? ""}:${m.sent_on_behalf_of_user_id ?? ""}`;
}

function mensagemDa(linha: LinhaDoFio | undefined): Message | null {
  return linha?.tipo === "item" && linha.item.kind === "message" ? linha.item.data : null;
}

function mesmoBloco(a: Message, b: Message): boolean {
  return (
    autorDa(a) === autorDa(b) &&
    Math.abs(new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()) <= JANELA_DO_BLOCO_MS
  );
}

/**
 * A bolha da linha `i` ABRE um bloco de falas seguidas do mesmo autor?
 *
 * É o que deixa o fio respirar: só a primeira do bloco leva o nome e o espaço
 * de cima, e as seguintes encostam, com o canto de cima achatado do lado de
 * quem fala. Dia, nota, passagem e o divisor de novas QUEBRAM o bloco, porque
 * ficam entre as duas.
 */
export function iniciaBloco(linhas: LinhaDoFio[], i: number): boolean {
  const atual = mensagemDa(linhas[i]);
  if (!atual) return true;
  const anterior = mensagemDa(linhas[i - 1]);
  return !anterior || !mesmoBloco(anterior, atual);
}
