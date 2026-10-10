"use client";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { DotsThree, Kanban, PencilSimple } from "@/lib/ui/icons";

/**
 * O menu "…" do negócio no painel (P13 da auditoria).
 *
 * "Editar" abre o dossiê do lead no quadro (`?lead=`, o deep link que o quadro
 * já entende), onde título, valor e campos se editam com as regras de lá.
 * "Abrir no quadro do funil" leva ao quadro inteiro.
 *
 * "Excluir lead" (P21) NÃO entra: não existe rota que exclua lead (só ganhar,
 * perder, mover, clonar e retomar), e um item que não tem para onde ir seria
 * um botão de mentira. Fica para a fase com backend.
 */
export function MenuDoLead({ leadId, pipelineId }: { leadId: string; pipelineId: string }) {
  const t = useT();
  return (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
