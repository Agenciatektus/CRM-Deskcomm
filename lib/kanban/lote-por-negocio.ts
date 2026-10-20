/**
 * AÇÕES EM LOTE QUE PASSAM PELA ROTA DE CADA NEGÓCIO (barra do Funil, 20/10/2026).
 *
 * Levar para outro funil, marcar como ganho e criar tarefa em lote NÃO têm rota
 * em lote própria: cada negócio vai pela MESMA rota da ação individual
 * (`/leads/[id]/clone`, `/leads/[id]/win`, `POST /tasks`). É o que garante as
 * mesmas guardas (papel, campos exigidos da etapa, guardas do banco, eventos)
 * sem uma segunda implementação que divergiria na primeira mudança.
 *
 * Cada chamada leva UM negócio, então o teto de 50 da rota em lote não se aplica;
 * a concorrência é baixa (4) para não disparar centenas de escritas juntas.
 * Quem falha NÃO desfaz quem deu certo: o resultado conta os dois lados, com o
 * motivo de cada falha, para o aviso do fim.
 */
export interface FalhaDoLote {
  id: string;
  motivo: string;
}

export interface ResultadoDoLote {
  feitos: string[];
  falhas: FalhaDoLote[];
}

const CONCORRENCIA = 4;

export function motivoDoErro(erro: unknown): string {
  if (erro instanceof Error && erro.message) return erro.message;
  if (erro && typeof erro === "object" && typeof (erro as { message?: unknown }).message === "string") {
    return (erro as { message: string }).message;
  }
  return String(erro);
}

export async function porNegocio(
  ids: string[],
  fazer: (id: string) => Promise<unknown>,
  concorrencia = CONCORRENCIA,
): Promise<ResultadoDoLote> {
  const feitos: string[] = [];
  const falhas: FalhaDoLote[] = [];
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < ids.length) {
      const id = ids[proximo++]!;
      try {
        await fazer(id);
        feitos.push(id);
      } catch (erro) {
        falhas.push({ id, motivo: motivoDoErro(erro) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concorrencia, ids.length) }, trabalhador));
  return { feitos, falhas };
}

/** "2× Campo X obrigatório; 1× Lead não encontrado." — o porquê, agrupado. */
export function resumoDasFalhas(falhas: FalhaDoLote[]): string {
  const contagem = new Map<string, number>();
  for (const f of falhas) contagem.set(f.motivo, (contagem.get(f.motivo) ?? 0) + 1);
  return [...contagem].map(([motivo, n]) => `${n}× ${motivo}`).join("; ");
}
