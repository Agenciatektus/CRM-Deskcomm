"use client";
import Link from "next/link";
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useLeadsAbertosPorFunil } from "@/hooks/pipelines/useLeadsAbertosPorFunil";
import { CaretDown, Kanban } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import {
  type FunilDoMenu,
  hrefDoFunil,
  mostrarNoDeFunis,
  noDeFunisAtivo,
  ROTULO_DO_NO_DE_FUNIS,
} from "@/lib/navigation/funis-no-menu";

/**
 * O nó "Pipeline" do menu, num componente só porque agora são DUAS barras que o
 * desenham: a de uma coluna (gaveta do celular, `SidebarContent`) e a de duas
 * colunas do desktop. Copiar o bloco nas duas faria a regra "começa fechado,
 * abre sozinho dentro de um funil" divergir na primeira correção.
 *
 * Único item da barra que ABRE em vez de navegar: a rota do quadro é
 * `/app/pipelines/[id]`, e `[id]` é uma linha do banco. Não existe
 * `/app/pipelines` sozinha para um destino fixo apontar.
 *
 * Some sem funil: um expansor que abre vazio promete conteúdo e entrega buraco;
 * quem ainda não tem funil chega por "Funis", que ensina a criar o primeiro.
 *
 * As classes de item ativo/inativo vêm de quem desenha, porque as duas barras
 * marcam a tela atual de jeitos diferentes e o nó precisa parecer da barra em
 * que está.
 */
export function NoDeFunis({
  funis,
  pathname,
  onNavigate,
  classeAtiva,
  classeInativa,
  iconeSize = 18,
}: {
  funis: readonly FunilDoMenu[];
  pathname: string;
  onNavigate?: () => void;
  classeAtiva: string;
  classeInativa: string;
  iconeSize?: number;
}) {
  const t = useT();
  // Começa FECHADO fora de um funil: a densidade da barra é medida. Dentro de um,
  // abre sozinho: entrar num quadro pelo ⌘K não pode fechar o ramo da tela aberta.
  const [abertoPeloClique, setAbertoPeloClique] = useState(false);
  if (!mostrarNoDeFunis(funis)) return null;
  const dentro = noDeFunisAtivo(pathname);
  const aberto = abertoPeloClique || dentro;

  return (
    <li>
      <button
        type="button"
        onClick={() => setAbertoPeloClique((v) => !v)}
        aria-expanded={aberto}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-1 text-sm transition-colors",
          dentro ? "text-foreground" : classeInativa,
        )}
      >
        <Kanban size={iconeSize} weight={dentro ? "fill" : "regular"} aria-hidden />
        <span className="truncate">{t(ROTULO_DO_NO_DE_FUNIS)}</span>
        <CaretDown
          size={14}
          className={cn(
            "ml-auto shrink-0 text-text-subtle transition-transform",
            !aberto && "-rotate-90",
          )}
          aria-hidden
        />
      </button>

      {aberto && (
        <FunisDoNo
          funis={funis}
          pathname={pathname}
          onNavigate={onNavigate}
          classeAtiva={classeAtiva}
          classeInativa={classeInativa}
        />
      )}
    </li>
  );
}

/**
 * Os filhos do nó, um por funil, com os leads ABERTOS de cada um (S18). Num
 * componente à parte para a contagem só ser pedida com o nó aberto: o hook
 * vive aqui, e este bloco só monta quando abre.
 */
function FunisDoNo({
  funis,
  pathname,
  onNavigate,
  classeAtiva,
  classeInativa,
}: {
  funis: readonly FunilDoMenu[];
  pathname: string;
  onNavigate?: () => void;
  classeAtiva: string;
  classeInativa: string;
}) {
  const t = useT();
  const { data: abertos } = useLeadsAbertosPorFunil(true);
  return (
    <ul className="mt-1 ml-4 space-y-1 border-l border-border pl-3">
      {funis.map((funil) => {
        const href = hrefDoFunil(funil.id);
        const ativo = pathname === href;
        const quantos = abertos?.[funil.id] ?? 0;
        return (
          <li key={funil.id}>
            <Link
              href={href}
              aria-current={ativo ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1 text-sm transition-colors",
                ativo ? classeAtiva : classeInativa,
              )}
            >
              {/*
                O nome do funil vem do banco e é escrito pelo cliente: não passa
                por `t()`, que traduziria "Clientes" para outro idioma como se
                fosse palavra da interface.
              */}
              <span className="truncate">{funil.name}</span>
              {quantos > 0 && (
                // O `.nav2-count` do protótipo, neutro: é volume do funil, não alerta.
                <span
                  data-testid="contador-do-funil"
                  aria-label={`${quantos} ${t("leads abertos")}`}
                  title={`${quantos} ${t("leads abertos")}`}
                  className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-surface-elevated px-1.5 text-xs font-bold leading-none text-text-muted tabular-nums"
                >
                  {quantos}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
