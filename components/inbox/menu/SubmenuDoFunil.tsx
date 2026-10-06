"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LeadRow } from "@/components/inbox/painel/tipos";
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useWinLead } from "@/hooks/kanban/useUpdateLead";
import { apiClient } from "@/lib/api/client";
import { avisarQueOCrmDoContatoMudou } from "@/lib/inbox/releitura-do-contato";
import { cn } from "@/lib/utils";
import { Funnel } from "@/lib/ui/icons";

import { CLASSE_DO_DETALHE, CLASSE_DO_ITEM, CLASSE_DO_SUBMENU, CLASSE_DO_TITULO } from "./estilo";

/** O pedido que precisa de janela própria e por isso sai do menu. */
export type DialogoDoFunil = { tipo: "perder" | "outro-funil"; lead: LeadRow };

/** A chave do resumo que o menu lê. Exportada para quem precisa reler depois de gravar. */
export function chaveDoResumoDoMenu(contactId: string) {
  return ["menu-da-conversa", "crm-summary", contactId] as const;
}

/**
 * TROCAR DE FUNIL OU ETAPA PELO MENU DA LISTA.
 *
 * O `crm-summary` é buscado SÓ quando o submenu abre (abrir o menu para assumir
 * não paga a leitura do CRM) e fica 30 s em cache: reabrir o submenu na mesma
 * conversa não refaz o pedido. O negócio é o mesmo que o painel mostra primeiro
 * (`leads[0]`, o mais recente).
 *
 * ⚠️ Nenhuma régua nova; cada destino é a porta que o `SeletorDeEtapa` já usa:
 *   - etapa aberta → `useMoveCard` (`/move`, com o CAS por `updated_at`);
 *   - etapa de ganho → `useWinLead` (`/win`);
 *   - etapa de perda → `LoseLeadDialog`, que exige o motivo;
 *   - outro funil → `MoveToOtherPipelineDialog` (`/clone`).
 */
export function SubmenuDoFunil({ contactId, onDialogo }: {
  contactId: string;
  onDialogo: (d: DialogoDoFunil) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const resumo = useQuery({
    queryKey: chaveDoResumoDoMenu(contactId),
    queryFn: () => apiClient.get<{ data: { leads: LeadRow[] } }>(`/api/v1/contacts/${contactId}/crm-summary`),
    enabled: aberto,
    staleTime: 30_000,
    select: (r) => r.data.leads ?? [],
  });
  const lead = resumo.data?.[0] ?? null;
  const pipelineId = lead?.pipeline_id ?? "";
  const mover = useMoveCard(pipelineId);
  const ganhar = useWinLead(pipelineId);

  const etapas = lead?.etapas ?? [];
  const indiceAtual = etapas.findIndex((e) => e.id === lead?.stage_id);
  const detalhe = !lead
    ? null
    : lead.status === "won"
      ? t("Ganho")
      : lead.status === "lost"
        ? t("Perdido")
        : (lead.etapa_nome ?? null);

  function feito() {
    toast.success(t("Etapa alterada"));
    void qc.invalidateQueries({ queryKey: chaveDoResumoDoMenu(contactId) });
    // O painel aberto neste contato relê; com outro contato, ignora.
    avisarQueOCrmDoContatoMudou(contactId);
  }

  function escolher(stageId: string) {
    if (!lead || stageId === lead.stage_id) return;
    const alvo = etapas.find((e) => e.id === stageId);
    if (!alvo) return;
    if (alvo.is_lost) return onDialogo({ tipo: "perder", lead });
    // `mutateAsync` e não `mutate(…, { onSuccess })`: o menu FECHA (e desmonta)
    // ao escolher, e o callback por chamada do react-query não roda em
    // componente desmontado. A promessa resolve de qualquer jeito. O erro já
    // vira aviso no `onError` do hook.
    const ignorar = () => {};
    if (alvo.is_won) return void ganhar.mutateAsync({ leadId: lead.id }).then(feito, ignorar);
    // Fim da coluna de destino, a mesma conta do seletor do painel.
    void mover
      .mutateAsync({ leadId: lead.id, stageId, positionInStage: Date.now(), expectedUpdatedAt: lead.updated_at })
      .then(feito, ignorar);
  }

  return (
    <DropdownMenuSub open={aberto} onOpenChange={setAberto}>
      <DropdownMenuSubTrigger className={CLASSE_DO_ITEM}>
        <Funnel size={16} aria-hidden />
        <span className="grow">{t("Funil e etapa")}</span>
        {detalhe && <span className={cn(CLASSE_DO_DETALHE, "max-w-24")}>{detalhe}</span>}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className={cn(CLASSE_DO_SUBMENU, "w-[250px]")} collisionPadding={8} aria-labelledby={undefined} aria-label={t("Funil e etapa")}>
          {resumo.isLoading && <DropdownMenuItem disabled className={CLASSE_DO_ITEM}>{t("Carregando…")}</DropdownMenuItem>}
          {resumo.isError && (
            <DropdownMenuItem disabled className={CLASSE_DO_ITEM}>{t("Não foi possível ler o funil.")}</DropdownMenuItem>
          )}
          {resumo.isSuccess && !lead && (
            <DropdownMenuItem disabled className={CLASSE_DO_ITEM}>{t("Este contato não tem negócio")}</DropdownMenuItem>
          )}
          {lead && (
            <>
              {lead.funil_nome && <div className={CLASSE_DO_TITULO}>{lead.funil_nome}</div>}
              {lead.status !== "open" ? (
                // Reabrir cria um negócio NOVO: fica no painel, com a confirmação dele.
                <DropdownMenuItem disabled className={CLASSE_DO_ITEM}>
                  {lead.status === "won" ? t("Negócio ganho") : t("Perdido")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuRadioGroup value={lead.stage_id} onValueChange={escolher}>
                  {etapas.map((e, i) => (
                    <DropdownMenuRadioItem
                      key={e.id}
                      value={e.id}
                      disabled={mover.isPending || ganhar.isPending}
                      className="h-[34px] gap-2 rounded-lg text-[13.5px] focus:bg-surface-elevated focus:text-text"
                    >
                      <span
                        aria-hidden
                        data-etapa={i < indiceAtual ? "feita" : i === indiceAtual ? "atual" : "adiante"}
                        className={cn(
                          "size-[9px] shrink-0 rounded-full border-[1.5px] border-border-strong",
                          i <= indiceAtual && "border-accent bg-accent",
                          i === indiceAtual && "ring-[3px] ring-accent-soft",
                        )}
                      />
                      <span className="min-w-0 truncate">{e.name}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
              {lead.status === "open" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className={CLASSE_DO_ITEM} onSelect={() => onDialogo({ tipo: "outro-funil", lead })}>
                    {t("Levar para outro funil…")}
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
