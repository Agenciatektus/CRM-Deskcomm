"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import type { ModoDeAdiar } from "@/lib/tarefas/adiar";
import type { PrioridadeDaTarefa } from "@/lib/tarefas/tipos";
import { Check } from "@/lib/ui/icons";

import { AdiarRapido } from "./AdiarRapido";
import { MenuDePrioridade, MenuDeResponsavel, type MembroDaEquipe } from "./MenusDaTarefa";

/**
 * BARRA EM LOTE DE TAREFAS — aparece com 1+ tarefa marcada: concluir, adiar,
 * reatribuir, mudar a prioridade e apagar (com confirmação). O desenho e o
 * comportamento são os da barra do Funil (`BulkActionBar`): presa ao pé da
 * área, quebra em linhas no celular, Esc limpa a seleção e, enquanto uma ação
 * está nos 5 s do Desfazer ou rodando, os botões travam (`ocupado`) — o duplo
 * clique não agenda a mesma coisa duas vezes.
 *
 * A barra só DECLARA a intenção; quem grava (e segura o Desfazer) é a tela,
 * pelo `useLoteDeTarefas`. Assim a vitrine do design system mostra a barra de
 * verdade sem nada sair do navegador.
 */
export function BarraEmLoteDeTarefas({
  quantidade,
  ocupado,
  membros,
  usuarioId,
  podeEditar,
  onConcluir,
  onAdiar,
  onReatribuir,
  onPrioridade,
  onApagar,
  onLimpar,
}: {
  quantidade: number;
  ocupado: boolean;
  membros: MembroDaEquipe[];
  usuarioId: string;
  podeEditar: boolean;
  onConcluir: () => void;
  onAdiar: (modo: ModoDeAdiar) => void;
  onReatribuir: (userId: string | null) => void;
  onPrioridade: (p: PrioridadeDaTarefa) => void;
  /** Devolve `true` quando apagou (a confirmação fecha). */
  onApagar: () => Promise<boolean>;
  onLimpar: () => void;
}) {
  const t = useT();
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (quantidade === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onLimpar();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [quantidade, onLimpar]);

  if (quantidade === 0) return null;

  const rotulo = quantidade === 1 ? t("1 tarefa selecionada") : `${quantidade} ${t("tarefas selecionadas")}`;

  return (
    <>
      <div
        role="toolbar"
        aria-label={t("Ações em lote")}
        data-lote-de-tarefas={quantidade}
        className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-md"
      >
        <span className="text-sm font-medium">{rotulo}</span>
        {podeEditar && (
          <>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={ocupado} onClick={onConcluir}>
              <Check aria-hidden />
              {t("Concluir")}
            </Button>
            <AdiarRapido onEscolher={onAdiar} disabled={ocupado} />
            <MenuDeResponsavel
              membros={membros}
              usuarioId={usuarioId}
              onEscolher={onReatribuir}
              lote={{ rotulo: t("Responsável…"), disabled: ocupado }}
            />
            <MenuDePrioridade
              onEscolher={onPrioridade}
              lote={{ rotulo: t("Prioridade…"), disabled: ocupado }}
            />
            <Button size="sm" variant="destructive" disabled={ocupado} onClick={() => setConfirmando(true)}>
              {t("Apagar")}
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={onLimpar}>
          {t("Cancelar")}
        </Button>
      </div>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{quantidade === 1 ? t("Apagar 1 tarefa?") : `${t("Apagar")} ${quantidade} ${t("tarefas?")}`}</DialogTitle>
            <DialogDescription>{t("As tarefas selecionadas são apagadas para toda a equipe. Não pode ser desfeito.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              {t("Cancelar")}
            </Button>
            <Button
              variant="destructive"
              disabled={ocupado}
              onClick={async () => {
                if (await onApagar()) setConfirmando(false);
              }}
            >
              {t("Apagar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
