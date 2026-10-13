import { toast } from "sonner";

import { acaoPendente, adiarAcao } from "./aviso-com-desfazer";

/**
 * FECHAR UM NEGÓCIO (ganho, perda, troca de funil) é ação adiada com Desfazer
 * (`adiarAcao`): `/win`, `/lose` e `/clone` emitem `lead.won`/`lead.lost`/
 * `lead.created` na hora, com efeito fora do CRM.
 *
 * A TRAVA é por negócio e vale para os TRÊS: enquanto um fechamento do lead está
 * segurado, nenhum outro se agenda, venha de onde vier (painel, menu da conversa,
 * folha do celular, card ou arraste do quadro). Sem isso, uma perda segurada no
 * painel não impedia um ganho arrastado no quadro no mesmo negócio (P2-1 do Cassio
 * na #181): o negócio emitiria `lead.lost` e depois `lead.won`.
 */
export type Fechamento = "ganho" | "perda" | "troca";

export function chaveDoFechamento(tipo: Fechamento, leadId: string): string {
  return `${tipo}:${leadId}`;
}

/** Há um fechamento (qualquer um) segurado para este negócio agora? */
export function fechamentoPendente(leadId: string): boolean {
  return (["ganho", "perda", "troca"] as const).some((tipo) => acaoPendente(chaveDoFechamento(tipo, leadId)));
}

/**
 * Agenda o fechamento com a chave dele, se nenhum outro do mesmo negócio estiver
 * segurado. Devolve `false` quando a trava recusou (quem chama não muda a tela).
 *
 * A recusa AVISA (observação do Cassio na #182): a janela de perda ou troca, a
 * folha ou o menu fecham, e sem o aviso pareceria que o fechamento foi aceito.
 * `t` é o tradutor de quem chama (`useT`), para o "Desfazer" e para o aviso.
 */
export function adiarFechamento(
  tipo: Fechamento,
  leadId: string,
  mensagem: (segundosRestantes: number) => string,
  t: (texto: string) => string,
  gravar: () => Promise<unknown>,
  aoDesfazer?: () => void,
): boolean {
  if (fechamentoPendente(leadId)) {
    toast.warning(t("Já há um fechamento em andamento para este negócio"));
    return false;
  }
  adiarAcao(mensagem, t("Desfazer"), gravar, aoDesfazer, { chave: chaveDoFechamento(tipo, leadId) });
  return true;
}
