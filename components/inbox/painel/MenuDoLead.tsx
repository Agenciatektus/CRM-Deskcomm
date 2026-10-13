"use client";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useArmado } from "@/hooks/ui/useArmado";
import { useBulkAction } from "@/hooks/kanban/useBulkAction";
import { adiarExclusao } from "@/lib/ui/aviso-com-desfazer";
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
 * tem coluna para isso): é DELETE real, e por isso a confirmação mora DENTRO do
 * menu e a rota só é chamada depois dos 5 s do Desfazer. Quem vê o item é a
 * mesma régua do card (`pipeline.move_card`).
 */
export function MenuDoLead({ leadId, pipelineId, titulo, leitura = false, onExcluido }: Props) {
  const t = useT();
  const podeExcluir = usePermission("pipeline.move_card") && !leitura;
  const excluir = useBulkAction(pipelineId);
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  /**
   * EXCLUSÃO ADIADA (quadro DS, "Aviso com Desfazer"): o lead não tem
   * arquivamento e o DELETE não volta, então o aviso SEGURA a exclusão por 5 s;
   * Desfazer cancela, e só depois a rota é chamada.
   */
  function excluirComDesfazer() {
    setAberto(false);
    setConfirmando(false);
    adiarExclusao(
      (s) => `${titulo ? `"${titulo}" ${t("será excluído em")}` : t("O lead será excluído em")} ${s} s`,
      t("Desfazer"),
      () =>
        excluir
          .mutateAsync({ action: "delete", lead_ids: [leadId], params: {} })
          .then(() => onExcluido?.()),
    );
  }

  return (
    <DropdownMenu
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setConfirmando(false);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("Mais ações do negócio")}
          className="grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <DotsThree size={16} weight="bold" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {confirmando ? (
          // Confirmação DENTRO do menu (`.confirm` do quadro), com o alvo nomeado.
          <div className="px-2 pb-2 pt-1.5" data-testid="confirmar-exclusao-do-lead">
            <p className="mb-3 whitespace-normal text-[13.5px] text-text-muted">
              <b className="text-text">{titulo ? `${t("Excluir")} "${titulo}"?` : t("Excluir lead")}</b>{" "}
              {t("O card sai do funil com o histórico de atividades. O contato e as conversas continuam.")}
            </p>
            <BotoesArmados
              ocupado={excluir.isPending}
              onCancelar={() => setConfirmando(false)}
              onExcluir={excluirComDesfazer}
            />
          </div>
        ) : (
          <>
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
                <DropdownMenuItem
                  variant="destructive"
                  disabled={excluir.isPending}
                  onSelect={(e) => {
                    e.preventDefault();
                    setConfirmando(true);
                  }}
                >
                  <Trash size={16} aria-hidden /> {t("Excluir lead…")}
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Cancelar e Excluir, desarmados nos primeiros 300 ms (contra o duplo clique). */
function BotoesArmados({ ocupado, onCancelar, onExcluir }: {
  ocupado: boolean;
  onCancelar: () => void;
  onExcluir: () => void;
}) {
  const t = useT();
  const armado = useArmado();
  return (
    <div className="flex justify-end gap-1.5">
      <Button size="sm" variant="outline" onClick={onCancelar} disabled={!armado}>
        {t("Cancelar")}
      </Button>
      <Button size="sm" variant="destructive" disabled={ocupado || !armado} onClick={onExcluir}>
        {t("Excluir")}
      </Button>
    </div>
  );
}
