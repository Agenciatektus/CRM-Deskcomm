"use client";

import { LinhaDeTarefa } from "@/components/tarefas/LinhaDeTarefa";
import { rotulosDaFaixa } from "@/components/tarefas/rotulos";
import { useUser } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { agrupaPorPrazo, type Tarefa } from "@/lib/tarefas/tipos";
import { cn } from "@/lib/utils";

interface Props {
  tarefas: Tarefa[];
  podeEditar: boolean;
  aoAlternarConcluida: (tarefa: Tarefa) => Promise<unknown>;
  aoEditar: (tarefa: Tarefa) => void;
  aoApagar: (tarefa: Tarefa) => Promise<unknown>;
  /**
   * Mostrar de qual negócio é cada tarefa, com o atalho para ele. A tela de
   * Tarefas mostra; o dossiê não — lá dentro todas são do mesmo negócio, e
   * repetir o nome dele em cada linha só tomaria espaço.
   */
  mostrarNegocio?: boolean;
}

export function ListaDeTarefas({
  tarefas,
  podeEditar,
  aoAlternarConcluida,
  aoEditar,
  aoApagar,
  mostrarNegocio = true,
}: Props) {
  const t = useT();
  const usuario = useUser();
  const grupos = agrupaPorPrazo(tarefas);
  // Os nomes vêm da lista de responsáveis, que é `agent`+ na rota: para quem só
  // lê, a consulta nem sai e a linha fica sem o nome — nunca com um id cru.
  const membros = useAssignableMembers(podeEditar);
  const nomes = new Map((membros.data ?? []).map((m) => [m.user_id, m.full_name]));

  function nomeDoResponsavel(tarefa: Tarefa): string | null {
    if (!tarefa.assigned_to) return null;
    if (tarefa.assigned_to === usuario.id) return t("Eu");
    return nomes.get(tarefa.assigned_to) ?? null;
  }

  const rotuloDaFaixa = rotulosDaFaixa(t);

  if (grupos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm font-medium">{t("Nenhuma tarefa por aqui")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Enquanto isto estiver vazio, o que foi combinado vive só na memória de alguém.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grupos.map((grupo) => (
        <section key={grupo.faixa}>
          <h2
            className={cn(
              "mb-1 px-3 text-xs font-semibold uppercase tracking-wider",
              grupo.faixa === "atrasada" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {rotuloDaFaixa[grupo.faixa]}
          </h2>
          <div className="rounded-xl border bg-card py-1">
            {grupo.tarefas.map((tarefa) => (
              <LinhaDeTarefa
                key={tarefa.id}
                tarefa={tarefa}
                podeEditar={podeEditar}
                aoAlternarConcluida={aoAlternarConcluida}
                aoEditar={aoEditar}
                aoApagar={aoApagar}
                mostrarVinculo={mostrarNegocio}
                nomeDoResponsavel={nomeDoResponsavel(tarefa)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
