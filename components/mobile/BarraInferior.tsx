"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ComponentType, ReactNode } from "react";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useAgentInbox } from "@/hooks/ai/useAgentInbox";
import { useT } from "@/hooks/i18n/useT";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { useTarefasAtrasadas } from "@/hooks/tasks/useTarefasAtrasadas";
import { abaDaRota, ehTelaCheia, RAIZ_DA_ABA, type AbaDoCelular } from "@/lib/mobile/abas";
import { Bell, ChatCircle, DotsThree, Kanban, ListChecks } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** As 5 abas, na ordem do protótipo (`tests/unit/paridade-mobile.test.ts` confere). */
export const ROTULOS_DAS_ABAS: Record<AbaDoCelular, string> = {
  conversas: "Conversas",
  funil: "Funil",
  tarefas: "Tarefas",
  avisos: "Avisos",
  mais: "Mais",
};

const ICONES: Record<AbaDoCelular, ComponentType<{ size?: number; weight?: "regular" | "fill"; "aria-hidden"?: boolean }>> = {
  conversas: ChatCircle,
  funil: Kanban,
  tarefas: ListChecks,
  avisos: Bell,
  mais: DotsThree,
};

const ORDEM: AbaDoCelular[] = ["conversas", "funil", "tarefas", "avisos", "mais"];

/**
 * Os contadores das abas, com as MESMAS consultas que o menu já faz (mesma chave do
 * React Query: nenhuma consulta nova, nenhum polling novo). Zero não desenha nada.
 */
function useContadores(): Partial<Record<AbaDoCelular, { n: number; classe: string; sufixo: string }>> {
  const { activeOrg } = useAuth();
  const fila = useConversationCounts(activeOrg?.orgId ?? null).data;
  const atrasadas = useTarefasAtrasadas().data ?? 0;
  const avisos = useAgentInbox("open").data?.open_count ?? 0;
  return {
    conversas: { n: fila?.fila ?? fila?.unassigned ?? 0, classe: "pele-grad-contador bg-accent text-accent-foreground", sufixo: "esperando uma pessoa" },
    tarefas: { n: atrasadas, classe: "bg-error-bg text-error-fg", sufixo: "atrasadas" },
    avisos: { n: avisos, classe: "bg-warning-bg text-warning-fg", sufixo: "em aberto" },
  };
}

/**
 * A barra inferior do app (abaixo de 760px): 5 abas, a pílula da aba acesa (marca do
 * revendedor no claro, degradê Verdash no escuro, pelo `pele-grad-contador`) e a área
 * segura embaixo. Tocar de novo na aba acesa volta ao começo dela. Some nas telas
 * cheias (conversa, ficha). `data-barra-inferior` é o que faz a casca reservar o espaço
 * dela (globals.css, `--mb-casca-baixo`).
 */
export function BarraInferior({ maisAberto, aoAbrirMais }: { maisAberto: boolean; aoAbrirMais: () => void }) {
  const t = useT();
  const rota = usePathname() ?? "";
  // `?.`: fora do roteador (testes de outras peças da casca) não há parâmetros.
  const idNaUrl = useSearchParams()?.get("id") ?? null;
  const router = useRouter();
  const contadores = useContadores();
  if (ehTelaCheia(rota, idNaUrl)) return null;
  const acesa = maisAberto ? "mais" : abaDaRota(rota);

  const aoTocar = (aba: AbaDoCelular) => (evento: React.MouseEvent) => {
    if (aba === "mais" || aba !== acesa) return;
    // Aba já acesa: volta ao começo dela; já no começo, sobe a tela.
    evento.preventDefault();
    const raiz = RAIZ_DA_ABA[aba];
    if (rota !== raiz || idNaUrl) router.push(raiz);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav
      aria-label={t("Seções do CRM")}
      data-barra-inferior=""
      className="fixed inset-x-0 bottom-0 z-30 hidden grid-cols-5 border-t border-border bg-mb-barra px-1 pt-1.5 pb-[calc(6px+var(--mb-area-baixo))] mb:grid"
    >
      {ORDEM.map((aba) => {
        const Icone = ICONES[aba];
        const ligada = aba === acesa;
        const contador = contadores[aba];
        const n = contador?.n ?? 0;
        const rotulo = t(ROTULOS_DAS_ABAS[aba]);
        const nome = n > 0 && contador ? `${rotulo}, ${n} ${t(contador.sufixo)}` : rotulo;
        const conteudo: ReactNode = (
          <>
            <span
              className={cn(
                "relative grid h-(--mb-aba-pilula-altura) w-(--mb-aba-pilula-largura) place-items-center rounded-(--mb-aba-pilula-raio) transition-colors duration-ui",
                ligada && "pele-grad-contador bg-accent-soft-2 text-accent-text",
              )}
            >
              <Icone size={22} weight={ligada ? "fill" : "regular"} aria-hidden />
              {n > 0 && contador && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -top-1.5 left-[34px] grid h-(--mb-aba-contador) min-w-(--mb-aba-contador) place-items-center rounded-full px-1.5 text-[11.5px] font-bold leading-none tabular-nums ring-2 ring-mb-barra",
                    contador.classe,
                  )}
                >
                  {n}
                </span>
              )}
            </span>
            <span>{rotulo}</span>
          </>
        );
        const classe = cn(
          "flex min-h-(--mb-aba-altura) flex-col items-center justify-center gap-1 text-(length:--mb-aba-fonte) font-semibold text-text-subtle",
          ligada && "font-bold text-text",
        );
        if (aba === "mais") {
          return (
            <button key={aba} type="button" aria-label={nome} aria-current={ligada ? "page" : undefined} aria-haspopup="dialog" onClick={aoAbrirMais} className={classe}>
              {conteudo}
            </button>
          );
        }
        return (
          <Link key={aba} href={RAIZ_DA_ABA[aba]} aria-label={nome} aria-current={ligada ? "page" : undefined} onClick={aoTocar(aba)} className={classe}>
            {conteudo}
          </Link>
        );
      })}
    </nav>
  );
}
