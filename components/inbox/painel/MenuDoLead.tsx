"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useBulkAction } from "@/hooks/kanban/useBulkAction";
import { DotsThree, Kanban, PencilSimple, Trash } from "@/lib/ui/icons";

interface Props {
  leadId: string;
  pipelineId: string;
  /** O título do negócio, para a confirmação dizer O QUE sai. */
  titulo?: string;
  /** Painel em leitura (viewer, suporte só-leitura): sem "Excluir". */
  leitura?: boolean;
  /** Depois de excluir: o painel recarrega os negócios do contato. */
  onExcluido?: () => void;
}

/**
 * O menu "…" do negócio no painel (P13 da auditoria).
 *
 * "Editar" abre o dossiê do lead no quadro (`?lead=`, o deep link que o quadro
 * já entende), onde título, valor e campos se editam com as regras de lá.
 * "Abrir no quadro do funil" leva ao quadro inteiro.
 *
 * "Excluir lead" (P21, fase 8b) usa a MESMA porta do "Excluir" do card no
 * quadro: `POST /api/v1/leads/bulk` com `action: "delete"` e um id só. Lá já
 * estão o papel (agent+, e a RLS `crm_leads_delete` exige manager ou alguém que
 * enxergue o lead), a organização da sessão, o evento `lead.bulk_deleted` e a
 * auditoria (`lead.bulk_action`). O lead não tem arquivamento (`crm_leads` não
 * tem coluna para isso): é DELETE real, e a confirmação diz que não volta. Quem
 * vê o item é a mesma régua do card (`pipeline.move_card`).
 */
export function MenuDoLead({ leadId, pipelineId, titulo, leitura = false, onExcluido }: Props) {
  const t = useT();
  const podeExcluir = usePermission("pipeline.move_card") && !leitura;
  const excluir = useBulkAction(pipelineId);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("Mais ações do negócio")}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <DotsThree size={16} weight="bold" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href={`/app/pipelines/${pipelineId}?lead=${leadId}`}>
              <PencilSimple size={16} aria-hidden /> {t("Editar")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/app/pipelines/${pipelineId}`}>
              <Kanban size={16} aria-hidden /> {t("Abrir no quadro do funil")}
            </Link>
          </DropdownMenuItem>
          {podeExcluir && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-error-fg" disabled={excluir.isPending} onSelect={() => setConfirmando(true)}>
                <Trash size={16} aria-hidden /> {t("Excluir lead")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{titulo ? `${t("Excluir")} "${titulo}"?` : t("Excluir lead")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "O card sai do funil com o histórico de atividades. O contato e as conversas continuam. Esta ação não pode ser desfeita.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            {/* `preventDefault`: quem fecha é o `onSuccess`, para um erro não
                chegar sobre uma janela que já sumiu (o mesmo do card). */}
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={excluir.isPending}
              onClick={(e) => {
                e.preventDefault();
                excluir.mutate(
                  { action: "delete", lead_ids: [leadId], params: {} },
                  {
                    onSuccess: () => {
                      setConfirmando(false);
                      toast.success(t("Lead excluído"));
                      onExcluido?.();
                    },
                  },
                );
              }}
            >
              {t("Excluir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
