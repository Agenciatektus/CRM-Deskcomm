"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useWinLead } from "@/hooks/kanban/useUpdateLead";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoseLeadDialog } from "./LoseLeadDialog";

export interface EtapaDoSeletor {
  id: string;
  name: string;
  is_won: boolean;
  is_lost: boolean;
}

interface Props {
  leadId: string;
  pipelineId: string;
  stageId: string;
  /** O `updated_at` do lead: vai como `expected_updated_at` (CAS, igual ao arrasto). */
  updatedAt: string;
  /** Só negócio aberto troca de etapa por aqui; reabrir é outro gesto. */
  aberto: boolean;
  /** Etapas ativas do funil DESTE lead, na ordem do quadro. */
  etapas: EtapaDoSeletor[];
  /**
   * Motivos de perda do funil. O quadro já os tem no cache e não precisa
   * passar; o Inbox não tem o quadro carregado, então os recebe do resumo.
   */
  motivosDoFunil?: string[];
  onMovido?: () => void;
}

/**
 * TROCAR A ETAPA SEM ARRASTAR O CARD — o mesmo seletor no dossiê do Pipeline e
 * no painel lateral do Inbox.
 *
 * ⚠️ NÃO HÁ CAMINHO NOVO NO SERVIDOR, e é deliberado. Cada destino usa a
 * mutação que o quadro já usa para o mesmo gesto:
 *   - etapa aberta → `useMoveCard` (`/move`, com CAS por `updated_at`, evento
 *     `lead.stage_changed` e as mesmas regras de funil);
 *   - etapa de ganho → `useWinLead` (`/win`);
 *   - etapa de perda → `LoseLeadDialog`, que exige o motivo como no card.
 * Um seletor que gravasse `stage_id` direto seria a segunda régua do funil, e a
 * primeira coisa a divergir seria justamente o motivo da perda.
 */
export function SeletorDeEtapa({
  leadId,
  pipelineId,
  stageId,
  updatedAt,
  aberto,
  etapas,
  motivosDoFunil,
  onMovido,
}: Props) {
  const t = useT();
  const podeMover = usePermission("pipeline.move_card");
  const mover = useMoveCard(pipelineId);
  const ganhar = useWinLead(pipelineId);
  const [perdendo, setPerdendo] = useState(false);
  const atual = etapas.find((e) => e.id === stageId);

  if (!podeMover || !aberto || etapas.length === 0) {
    return (
      <span data-testid="etapa-somente-leitura" className="text-text-muted">
        {atual?.name ?? "—"}
      </span>
    );
  }

  function escolher(id: string) {
    if (id === stageId) return;
    const alvo = etapas.find((e) => e.id === id);
    if (!alvo) return;
    if (alvo.is_lost) {
      setPerdendo(true);
      return;
    }
    const feito = () => {
      toast.success(t("Etapa alterada"));
      onMovido?.();
    };
    if (alvo.is_won) {
      ganhar.mutate({ leadId }, { onSuccess: feito });
      return;
    }
    // Vai para o fim da coluna de destino: `Date.now()` é maior que qualquer
    // posição que o quadro gera (MAX + 1000), e evita ler a coluna antes.
    mover.mutate(
      { leadId, stageId: id, positionInStage: Date.now(), expectedUpdatedAt: updatedAt },
      { onSuccess: feito },
    );
  }

  return (
    <>
      <Select value={stageId} onValueChange={escolher} disabled={mover.isPending || ganhar.isPending}>
        <SelectTrigger
          aria-label={t("Etapa do negócio")}
          data-testid="seletor-de-etapa"
          className="h-7 w-auto min-w-32 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* Lead parado numa etapa ARQUIVADA: sem esta opção o seletor abre em
              branco. Mostra onde ele está, sem oferecer voltar para lá. */}
          {!atual && (
            <SelectItem value={stageId} disabled className="text-xs">
              {t("Etapa arquivada")}
            </SelectItem>
          )}
          {etapas.map((e) => (
            <SelectItem key={e.id} value={e.id} className="text-xs">
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {perdendo && (
        <LoseLeadDialog
          open
          onOpenChange={(v) => {
            if (v) return;
            setPerdendo(false);
            onMovido?.();
          }}
          leadId={leadId}
          pipelineId={pipelineId}
          motivosDoFunil={motivosDoFunil}
        />
      )}
    </>
  );
}
