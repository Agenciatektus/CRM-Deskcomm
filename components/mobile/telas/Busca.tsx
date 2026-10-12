"use client";
import { useSyncExternalStore } from "react";

import { Resultados } from "@/components/shell/CommandPalette";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { CaretLeft, ClockCounterClockwise } from "@/lib/ui/icons";

const MAXIMO = 5;
const ouvintes = new Set<() => void>();

function chave(userId: string): string {
  return `crm-buscas-recentes:${userId}`;
}

function lerCru(userId: string): string {
  try {
    return window.localStorage.getItem(chave(userId)) ?? "[]";
  } catch {
    return "[]";
  }
}

function lista(cru: string): string[] {
  try {
    const v: unknown = JSON.parse(cru);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAXIMO) : [];
  } catch {
    return [];
  }
}

function lembrar(userId: string, termo: string) {
  const limpo = termo.trim();
  if (!limpo) return;
  const nova = [limpo, ...lista(lerCru(userId)).filter((x) => x !== limpo)].slice(0, MAXIMO);
  try {
    window.localStorage.setItem(chave(userId), JSON.stringify(nova));
  } catch {
    // Armazenamento bloqueado: a busca só não fica lembrada.
  }
  for (const aviso of ouvintes) aviso();
}

function assinar(aviso: () => void): () => void {
  ouvintes.add(aviso);
  window.addEventListener("storage", aviso);
  return () => {
    ouvintes.delete(aviso);
    window.removeEventListener("storage", aviso);
  };
}

/** As buscas recentes deste aparelho e desta pessoa (o `.rec` do protótipo). */
function BuscasRecentes({ userId, aoEscolher }: { userId: string; aoEscolher: (termo: string) => void }) {
  const t = useT();
  const cru = useSyncExternalStore(assinar, () => lerCru(userId), () => "[]");
  const recentes = lista(cru);
  if (recentes.length === 0) return null;
  return (
    <section aria-label={t("Buscas recentes")} className="border-b border-border pb-1">
      <h2 className="px-5 pt-4 pb-1.5 text-xs font-bold tracking-[0.06em] text-text-subtle uppercase">
        {t("Buscas recentes")}
      </h2>
      {recentes.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => aoEscolher(r)}
          className="pele-foco flex min-h-(--mb-alvo) w-full items-center gap-3.5 px-5 text-left text-text-muted hover:bg-hover"
        >
          <ClockCounterClockwise size={18} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-(length:--mb-linha-nome) text-text">{r}</span>
        </button>
      ))}
    </section>
  );
}

/**
 * A BUSCA ABERTA do celular (tela 11 do protótipo): tela cheia, voltar à esquerda do
 * campo, buscas recentes sem termo e os mesmos resultados da busca geral do desktop
 * (`Resultados` do `CommandPalette`: contatos, conversas, leads, ações e telas, com
 * o mesmo escopo de papel). Um Dialog do Radix: foco preso, Esc e o voltar fecham.
 * Recentes ficam no `localStorage` por pessoa, lidos só depois da hidratação.
 */
export function Busca({
  aberta,
  aoMudar,
  verTodasNaLista = false,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  verTodasNaLista?: boolean;
}) {
  const t = useT();
  return (
    <Dialog open={aberta} onOpenChange={aoMudar}>
      <DialogContent
        data-testid="busca-do-celular"
        className="inset-0 top-0 left-0 flex h-[100dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 pt-(--mb-area-topo) pb-(--mb-area-baixo) shadow-none motion-reduce:animate-none sm:rounded-none [&>button:last-child]:hidden"
      >
        <DialogTitle className="sr-only">{t("Busca geral")}</DialogTitle>
        {/* O miolo só monta com a busca aberta (o Radix desmonta ao fechar). */}
        <MioloDaBusca aoFechar={() => aoMudar(false)} verTodasNaLista={verTodasNaLista} />
      </DialogContent>
    </Dialog>
  );
}

function MioloDaBusca({ aoFechar, verTodasNaLista }: { aoFechar: () => void; verTodasNaLista: boolean }) {
  const t = useT();
  const { user } = useAuth();
  return (
    <Resultados
      verTodasNaLista={verTodasNaLista}
      aoEscolher={(termo) => {
        lembrar(user.id, termo);
        aoFechar();
      }}
      antesDoCampo={
        <button
          type="button"
          onClick={aoFechar}
          aria-label={t("Voltar")}
          className="pele-foco grid size-(--mb-alvo) shrink-0 place-items-center rounded-full text-accent-text hover:bg-hover"
        >
          <CaretLeft size={22} weight="bold" aria-hidden />
        </button>
      }
      semTermo={(definir) => <BuscasRecentes userId={user.id} aoEscolher={definir} />}
    />
  );
}
