"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { PRIORIDADES_DA_TAREFA, type PrioridadeDaTarefa } from "@/lib/tarefas/tipos";
import { CaretDown, Check } from "@/lib/ui/icons";

import { rotulosDaPrioridade, TOM_DA_PRIORIDADE } from "./rotulos";

export interface MembroDaEquipe {
  user_id: string;
  full_name: string | null;
}

/**
 * O gatilho: o nó pronto (a pílula/nome da linha) ou, na barra em lote, um
 * botão com rótulo desenhado AQUI, direto dentro do `DropdownMenuTrigger
 * asChild` — é o pai que dá o comportamento ao botão.
 */
type Gatilho = { gatilho: ReactNode; lote?: undefined } | { gatilho?: undefined; lote: { rotulo: string; disabled?: boolean } };

function GatilhoDoMenu({ gatilho, lote }: Gatilho) {
  if (lote) {
    return (
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={lote.disabled}>
          {lote.rotulo}
        </Button>
      </DropdownMenuTrigger>
    );
  }
  return <DropdownMenuTrigger asChild>{gatilho}</DropdownMenuTrigger>;
}

/**
 * Os dois menus de troca rápida da tarefa — responsável e prioridade —,
 * partilhados pela linha (gatilho = a própria pílula/nome) e pela barra em
 * lote (gatilho = botão com rótulo). As opções de responsável são as de
 * `GET /api/v1/team/assignable`, a MESMA régua que a rota confere ao gravar.
 */
export function MenuDeResponsavel({
  gatilho,
  lote,
  membros,
  usuarioId,
  atual,
  onEscolher,
}: Gatilho & {
  membros: MembroDaEquipe[];
  usuarioId: string;
  /** `undefined` = o lote (vários responsáveis): nenhum marcado. */
  atual?: string | null;
  onEscolher: (userId: string | null) => void;
}) {
  const t = useT();
  const marca = (id: string | null) => (atual !== undefined && atual === id ? <Check size={14} aria-hidden /> : null);
  return (
    <DropdownMenu>
      {lote ? <GatilhoDoMenu lote={lote} /> : <GatilhoDoMenu gatilho={gatilho} />}
      <DropdownMenuContent align="start" folhaNoCelular className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>{t("Responsável")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onEscolher(usuarioId)} className="justify-between gap-4">
          {t("Eu")}
          {marca(usuarioId)}
        </DropdownMenuItem>
        {membros
          .filter((m) => m.user_id !== usuarioId)
          .map((m) => (
            <DropdownMenuItem key={m.user_id} onClick={() => onEscolher(m.user_id)} className="justify-between gap-4">
              {m.full_name ?? t("Sem nome")}
              {marca(m.user_id)}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEscolher(null)} className="justify-between gap-4">
          {t("Sem responsável")}
          {marca(null)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A pílula de prioridade, com o tom do design system. */
export function PilulaDePrioridade({ prioridade, menu = false }: { prioridade: PrioridadeDaTarefa; menu?: boolean }) {
  const t = useT();
  return (
    <Badge variant={TOM_DA_PRIORIDADE[prioridade]}>
      {rotulosDaPrioridade(t)[prioridade]}
      {menu && <CaretDown aria-hidden />}
    </Badge>
  );
}

export function MenuDePrioridade({
  gatilho,
  lote,
  atual,
  onEscolher,
}: Gatilho & {
  atual?: PrioridadeDaTarefa;
  onEscolher: (p: PrioridadeDaTarefa) => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      {lote ? <GatilhoDoMenu lote={lote} /> : <GatilhoDoMenu gatilho={gatilho} />}
      <DropdownMenuContent align="start" folhaNoCelular>
        <DropdownMenuLabel>{t("Prioridade")}</DropdownMenuLabel>
        {[...PRIORIDADES_DA_TAREFA].reverse().map((p) => (
          <DropdownMenuItem key={p} onClick={() => onEscolher(p)} className="justify-between gap-4">
            <PilulaDePrioridade prioridade={p} />
            {atual === p && <Check size={14} aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
