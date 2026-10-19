"use client";
import { useId, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useMoveLeadToPipeline } from "@/hooks/kanban/useUpdateLead";
import { useDestinosDeFunil } from "@/hooks/kanban/useDestinosDeFunil";

interface MoveToOtherPipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  pipelineId: string;
  /** Chamado só quando o clone GRAVOU (o Cancelar também fecha a janela). */
  aoConcluir?: () => void;
  /**
   * Segura a gravação (ação adiada com Desfazer e a trava por negócio,
   * `adiarFechamento`), como o painel. Sem isto, grava na hora (o quadro).
   */
  adiar?: (gravar: () => Promise<unknown>) => void;
}

/**
 * "Levar para outro funil" — a TELA que faltava para
 * `POST /api/v1/leads/[id]/clone`, que MOVE o mesmo card desde a 9053 (aqui só
 * se escolhe o destino).
 *
 * Sem seletor de etapa: a rota já escolhe a primeira etapa aberta do funil
 * destino quando nenhuma é informada — um segundo campo aqui duplicaria uma
 * decisão que o servidor já toma bem, pela doutrina DIRC ("calcular" antes de
 * "duplicar").
 */
export function MoveToOtherPipelineDialog({
  open,
  onOpenChange,
  leadId,
  pipelineId,
  aoConcluir,
  adiar,
}: MoveToOtherPipelineDialogProps) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Levar para outro funil")}</DialogTitle>
          <DialogDescription>
            {t(
              'O mesmo negócio vai para o funil escolhido, com conversa, histórico, etiquetas e campos. Este funil continua contando o resultado que ele teve aqui.',
            )}
          </DialogDescription>
        </DialogHeader>
        {/* O formulário só monta com a janela aberta: os destinos não são
            consultados à toa, e a escolha nasce zerada a cada abertura. */}
        {open && (
          <FormularioDeOutroFunil
            leadId={leadId}
            pipelineId={pipelineId}
            adiar={adiar}
            onCancelar={() => onOpenChange(false)}
            onConcluido={() => {
              onOpenChange(false);
              aoConcluir?.();
            }}
            rodape={(botoes) => <DialogFooter>{botoes}</DialogFooter>}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * O FORMULÁRIO de levar para outro funil, sem a janela: mesma rota (`/clone`)
 * e mesmas regras, para o painel do lead na Inbox (P19 da auditoria).
 */
export function FormularioDeOutroFunil({
  leadId,
  pipelineId,
  onCancelar,
  onConcluido,
  adiar,
  rodape,
}: {
  leadId: string;
  pipelineId: string;
  onCancelar: () => void;
  onConcluido: () => void;
  /**
   * Quando presente, o clone NÃO sai na hora: quem chama recebe a gravação e a
   * segura (`adiarAcao`): Desfazer dentro da janela cancela sem chamar a rota
   * (P2-2 do Cassio na #169).
   */
  adiar?: (gravar: () => Promise<unknown>) => void;
  rodape: (botoes: React.ReactNode) => React.ReactNode;
}) {
  const t = useT();
  const [targetPipelineId, setTargetPipelineId] = useState("");
  // Padrão DESLIGADO: ligada, a etapa de destino roda as automações de entrada.
  const [rodarAutomacoes, setRodarAutomacoes] = useState(false);
  const idRodar = useId();
  const mutation = useMoveLeadToPipeline(pipelineId);
  const destinos = useDestinosDeFunil(leadId, true);

  const disabled = !targetPipelineId || mutation.isPending;

  const handleSubmit = async () => {
    if (disabled) return;
    try {
      const args = { leadId, targetPipelineId, rodarAutomacoesDeEntrada: rodarAutomacoes };
      if (adiar) {
        adiar(() => mutation.mutateAsync(args));
      } else {
        await mutation.mutateAsync(args);
      }
      setTargetPipelineId("");
      onConcluido();
    } catch {
      // error already toasted
    }
  };

  return (
    <>

        {/*
          Instalação nova nasce com UM funil só: sem esta frase o diálogo abre
          com uma lista vazia e um botão que nunca habilita, sem dizer por quê.
        */}
        {destinos.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Este é o único funil. Crie outro funil para poder levar o negócio até ele.")}
          </p>
        ) : (
          <Select value={targetPipelineId} onValueChange={setTargetPipelineId}>
            <SelectTrigger aria-label={t("Funil de destino")}>
              <SelectValue placeholder={t("Escolha o funil de destino")} />
            </SelectTrigger>
            <SelectContent>
              {(destinos.data ?? []).map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {destinos.data?.length !== 0 && (
          <label htmlFor={idRodar} className="flex items-start gap-2 text-sm">
            <input
              id={idRodar}
              type="checkbox"
              checked={rodarAutomacoes}
              onChange={(e) => setRodarAutomacoes(e.target.checked)}
              className="mt-1 accent-primary"
            />
            <span>
              {t("Rodar as automações de entrada da etapa")}
              <span className="block text-xs text-muted-foreground">
                {t("As automações da etapa de destino rodam como se o card tivesse acabado de entrar. Conversões de anúncio não são enviadas.")}
              </span>
            </span>
          </label>
        )}

      {rodape(
        <>
          <Button
            variant="outline"
            onClick={onCancelar}
            disabled={mutation.isPending}
          >
            {t("Cancelar")}
          </Button>
          <Button onClick={handleSubmit} disabled={disabled}>
            {mutation.isPending ? t("Salvando...") : t("Confirmar")}
          </Button>
        </>,
      )}
    </>
  );
}
