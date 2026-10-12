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
 * EXCLUSÃO ADIADA: para o que não tem volta no servidor (excluir lead é DELETE
 * definitivo), o aviso SEGURA a ação por 5 segundos e só então chama a rota.
 * Desfazer dentro desse tempo cancela; fechar o aviso ou o tempo acabar
 * executa. Se a página fechar antes, nada é excluído (o lado seguro).
 */
export function adiarExclusao(
  mensagem: string,
  rotuloDoDesfazer: string,
  executar: () => Promise<unknown>,
  aoDesfazer?: () => void,
): void {
  let decidido = false;
  const rodar = () => {
    if (decidido) return;
    decidido = true;
    void executar().catch((erroAoExcluir: unknown) => {
      toast.error(erroAoExcluir instanceof Error ? erroAoExcluir.message : String(erroAoExcluir));
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
