import { toast } from "sonner";

/**
 * O "Aviso com Desfazer" do quadro DS ("Retorno e redimensionamento"): embaixo,
 * some em 5 segundos, e o botão Desfazer devolve o estado anterior pela rota
 * inversa que já existe (reabrir, desarquivar, desbloquear, mover de volta).
 */
export const DURACAO_DO_DESFAZER = 5_000;

export function avisarComDesfazer(
  mensagem: string,
  rotuloDoDesfazer: string,
  desfazer: () => void | Promise<unknown>,
): void {
  toast(mensagem, {
    duration: DURACAO_DO_DESFAZER,
    action: {
      label: rotuloDoDesfazer,
      onClick: () => {
        void Promise.resolve()
          .then(desfazer)
          .catch((erroAoDesfazer: unknown) => {
            toast.error(erroAoDesfazer instanceof Error ? erroAoDesfazer.message : String(erroAoDesfazer));
          });
      },
    },
  });
}

/**
 * AÇÃO ADIADA: para o que não tem volta de verdade no servidor, o aviso SEGURA
 * a ação por 5 segundos e só então chama a rota. Desfazer dentro desse tempo
 * cancela sem chamar nada; fechar o aviso ou o tempo acabar executa.
 *
 * Usada em:
 *  - excluir lead (DELETE definitivo);
 *  - GANHAR, PERDER e TROCAR DE FUNIL: `/win`, `/lose` e `/clone` disparam
 *    `lead.won`/`lead.lost`/`lead.created` na hora, com efeito FORA do CRM
 *    (conversão de anúncio para a Meta/Google, saídas da cadência, push,
 *    automações do funil de destino). Mover de volta não desfaz nada disso; só
 *    não chamar a rota desfaz (P1 do Cassio na #169).
 *
 * ⚠️ Se a página fechar ou recarregar dentro dos 5 s, a ação NÃO acontece (o
 * aviso morre com a página). É o lado seguro: nada sai do CRM sem os 5 s, e o
 * negócio fica como estava. A tela mostra o estado otimista enquanto isso.
 */
export function adiarAcao(
  mensagem: string,
  rotuloDoDesfazer: string,
  executar: () => Promise<unknown>,
  aoDesfazer?: () => void,
): void {
  let decidido = false;
  const rodar = () => {
    if (decidido) return;
    decidido = true;
    void executar().catch((erroDaAcao: unknown) => {
      toast.error(erroDaAcao instanceof Error ? erroDaAcao.message : String(erroDaAcao));
    });
  };
  toast(mensagem, {
    duration: DURACAO_DO_DESFAZER,
    action: {
      label: rotuloDoDesfazer,
      onClick: () => {
        if (decidido) return;
        decidido = true;
        aoDesfazer?.();
      },
    },
    onAutoClose: rodar,
    onDismiss: rodar,
  });
}

/** A exclusão adiada é a ação adiada aplicada a um DELETE. */
export const adiarExclusao = adiarAcao;
