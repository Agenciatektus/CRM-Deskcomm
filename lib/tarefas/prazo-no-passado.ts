/**
 * Prazo de tarefa no passado (P2 de backend do Cassio na #171): a tela já não
 * oferece, mas a rota também recusa, para o limite não depender só da tela.
 *
 * FOLGA de 5 minutos: entre a pessoa escolher "agora" e o pedido chegar passam
 * segundos, e relógio de máquina erra um pouco; recusar isso seria recusar o
 * uso certo.
 *
 * Tarefa CONCLUÍDA ou CANCELADA pode ter prazo no passado: é o registro de algo
 * que já aconteceu (o caso retroativo legítimo), não um lembrete para o futuro.
 */
export const FOLGA_DO_PRAZO_MS = 5 * 60_000;

const SITUACOES_QUE_REGISTRAM = new Set(["done", "cancelled"]);

export function prazoNoPassado(
  prazo: string | null | undefined,
  situacao: string | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!prazo) return false;
  if (situacao && SITUACOES_QUE_REGISTRAM.has(situacao)) return false;
  const instante = new Date(prazo).getTime();
  return Number.isFinite(instante) && instante < agora.getTime() - FOLGA_DO_PRAZO_MS;
}
