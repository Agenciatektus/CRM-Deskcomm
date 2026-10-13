"use client";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { adiarAcao, useAcaoPendente } from "@/lib/ui/aviso-com-desfazer";
import { Check } from "@/lib/ui/icons";
import { estaAtrasada, faixaDePrazo, type SituacaoDaTarefa, type Tarefa } from "@/lib/tarefas/tipos";
import { cn } from "@/lib/utils";

/** A chave da conclusão adiada de uma tarefa (a trava de `adiarAcao`). */
export const chaveDaConclusao = (id: string) => `concluir-tarefa:${id}`;

function prazoNaLinguaDeQuemOlha(tarefa: Tarefa, agora: Date, tag: string, t: (s: string) => string): string {
  if (!tarefa.due_date) return t("Sem prazo");
  const d = new Date(tarefa.due_date);
  const hora = d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
  const dia = d.toLocaleDateString(tag, { day: "2-digit", month: "2-digit" });
  if (estaAtrasada(tarefa, agora)) return `${t("Atrasada, era")} ${faixaDePrazo({ ...tarefa, status: "pending" }, agora) === "hoje" ? `${t("hoje às")} ${hora}` : `${dia} ${hora}`}`;
  if (faixaDePrazo(tarefa, agora) === "hoje") return `${t("Hoje às")} ${hora}`;
  return `${dia} ${hora}`;
}

/**
 * Um cartão da Lista de tarefas do celular: o check de 48px (concluir com um toque) e
 * o corpo, que abre a tarefa. Concluir é ADIADO 5 s com Desfazer (`adiarAcao`), como
 * o resto do app: a tarefa vai para "Concluídas" na hora e só é gravada quando o aviso
 * acaba; Desfazer a devolve sem ter gravado nada. Reabrir uma concluída grava na hora.
 */
export function CartaoDaTarefa({
  tarefa,
  concluida,
  apoio,
  agora,
  tag,
  podeEditar,
  aoAbrir,
  aoConcluir,
  aoDesfazer,
  gravar,
}: {
  tarefa: Tarefa;
  concluida: boolean;
  apoio: string | null;
  agora: Date;
  tag: string;
  podeEditar: boolean;
  aoAbrir: () => void;
  aoConcluir: () => void;
  aoDesfazer: () => void;
  gravar: (status: SituacaoDaTarefa) => Promise<unknown>;
}) {
  const t = useT();
  const gravando = useAcaoPendente(chaveDaConclusao(tarefa.id));
  const atrasada = !concluida && estaAtrasada(tarefa, agora);

  function alternar() {
    if (!concluida) {
      aoConcluir();
      adiarAcao(
        (s) => `${t("Concluída em")} ${s} s`,
        t("Desfazer"),
        () =>
          gravar("done").catch((erro: unknown) => {
            aoDesfazer();
            throw erro;
          }),
        aoDesfazer,
        { chave: chaveDaConclusao(tarefa.id) },
      );
      return;
    }
    // Reabrir: a conclusão já foi gravada (enquanto o aviso corre, o check fica
    // desligado e quem desfaz é o Desfazer do aviso).
    aoDesfazer();
    gravar("pending").catch((erro: unknown) => {
      aoConcluir();
      toast.error(erro instanceof Error ? erro.message : String(erro));
    });
  }

  return (
    <div
      data-testid="cartao-da-tarefa"
      className="mx-4 mb-2 grid grid-cols-[48px_minmax(0,1fr)] items-center rounded-[14px] bg-surface py-1 pr-3 pl-0.5 shadow-[0_0_0_1px_var(--color-border)]"
    >
      <button
        type="button"
        aria-pressed={concluida}
        aria-label={`${concluida ? t("Reabrir:") : t("Concluir:")} ${tarefa.title}`}
        disabled={!podeEditar || (concluida && gravando)}
        onClick={alternar}
        className="pele-foco grid size-12 place-items-center rounded-full disabled:opacity-60"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-6 place-items-center rounded-full",
            concluida ? "bg-accent text-accent-foreground" : "shadow-[inset_0_0_0_2px_var(--color-border-strong)]",
          )}
        >
          {concluida && <Check size={14} weight="bold" />}
        </span>
      </button>
      <button
        type="button"
        onClick={aoAbrir}
        disabled={!podeEditar}
        className="pele-foco min-h-12 min-w-0 py-2 text-left disabled:cursor-default"
      >
        <b className={cn("block text-[15.5px] leading-[1.3] text-text", concluida && "text-text-subtle line-through")}>{tarefa.title}</b>
        {apoio && <small className="mt-0.5 block text-[13px] text-text-muted">{apoio}</small>}
        <span
          className={cn(
            "mt-0.5 block text-[13px] font-semibold",
            concluida ? "text-text-muted" : atrasada ? "text-error-fg" : faixaDePrazo(tarefa, agora) === "hoje" ? "text-accent-text" : "text-text-muted",
          )}
        >
          {concluida ? t("Concluída agora") : prazoNaLinguaDeQuemOlha(tarefa, agora, tag, t)}
        </span>
      </button>
    </div>
  );
}
