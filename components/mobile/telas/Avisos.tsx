"use client";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";

import { ResultadoDoCompromisso } from "@/components/shell/ResultadoDoCompromisso";
import { aparencia, CLASSE_DO_TOM, pedeDesfecho, useCentralDeAvisos } from "@/components/shell/useCentralDeAvisos";
import type { AgentInboxItem } from "@/hooks/ai/useAgentInbox";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { kindLabel } from "@/lib/ai/agent-inbox-copy";
import { roleAtLeast } from "@/lib/auth/types";
import { CheckCircle, DotsThree } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { FolhaInferior, ItemDaFolha } from "../FolhaInferior";

/** A mesma régua do sino e da página `/app/ai/inbox`: resolve quem é `agent` ou acima. */
export function usePodeResolverAvisos(): boolean {
  return roleAtLeast(useAuth().activeOrg?.role ?? null, "agent");
}

const botao = (primario: boolean) =>
  cn(
    "pele-foco inline-flex min-h-(--mb-alvo) items-center rounded-xl px-3.5 text-sm font-bold",
    primario ? "pele-grad-contador bg-accent text-accent-foreground" : "text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]",
  );

/**
 * AVISOS NO CELULAR (o item 08 do protótipo), no lugar do popover do sino: abas Abertos
 * e Resolvidos com contagem, e cada aviso em cartão com o ícone do tipo e as ações da
 * central do desktop (o destino do aviso, como Assumir ou Abrir conversa; Compareceu,
 * Faltou e Remarcou no compromisso; Marcar resolvido; Reabrir). Fontes, ações e régua
 * de papel são as do sino (`useCentralDeAvisos`): nenhuma consulta nova. O "Marcar
 * todos resolvidos" mora no ⋯ do cabeçalho (`AcoesDosAvisos`).
 */
export function AvisosNoCelular() {
  const t = useT();
  const podeResolver = usePodeResolverAvisos();
  const { aba, setAba, atual, itens, nAbertos, nResolvidos, atualizar } = useCentralDeAvisos(t);

  return (
    <div className="flex flex-col pb-4" data-testid="avisos-no-celular">
      <div role="tablist" aria-label={t("Situação dos avisos")} className="mx-4 flex gap-1 rounded-xl bg-tint p-1">
        {(["open", "resolved"] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={cn(
              "pele-foco flex min-h-(--mb-alvo) flex-1 items-center justify-center rounded-[10px] text-[14.5px] font-semibold",
              aba === valor ? "bg-surface text-text shadow-sm" : "text-text-muted",
            )}
          >
            {valor === "open"
              ? `${t("Abertos")} (${nAbertos})`
              : nResolvidos === null
                ? t("Resolvidos")
                : `${t("Resolvidos")} (${nResolvidos})`}
          </button>
        ))}
      </div>
      {atualizar.isError && (
        <p role="alert" className="px-4 pt-3 text-sm text-error-fg">
          {t("Não foi possível atualizar este aviso. Tente novamente.")}
        </p>
      )}
      <ul className="flex flex-col gap-2.5 px-4 pt-3" data-testid="avisos-lista">
        {atual.isLoading && <li className="py-8 text-center text-sm text-text-muted">{t("Carregando…")}</li>}
        {atual.isError && <li className="py-8 text-center text-sm text-text-muted">{t("Não foi possível carregar os avisos. Tente novamente.")}</li>}
        {!atual.isLoading && !atual.isError && itens.length === 0 && (
          <li className="px-4 py-10 text-center text-text-muted">
            <b className="mb-1.5 block text-[17px] text-text">{aba === "open" ? t("Nenhum aviso em aberto") : t("Nenhum aviso resolvido")}</b>
            <p className="text-[14.5px]">
              {aba === "open"
                ? t("Quando o assistente precisar de você, o aviso aparece aqui.")
                : t("Avisos que você marcar como resolvidos ficam aqui.")}
            </p>
          </li>
        )}
        {itens.map((item) => (
          <CartaoDoAviso
            key={item.id}
            item={item}
            podeResolver={podeResolver}
            pendente={atualizar.isPending}
            onStatus={(status) => atualizar.mutate({ id: item.id, status })}
          />
        ))}
      </ul>
    </div>
  );
}

function CartaoDoAviso({
  item,
  podeResolver,
  pendente,
  onStatus,
}: {
  item: AgentInboxItem;
  podeResolver: boolean;
  pendente: boolean;
  onStatus: (status: "open" | "resolved") => void;
}) {
  const t = useT();
  const locale = useLocaleDeData();
  const { Icone, tom } = aparencia(item);
  const aberto = item.status !== "resolved";
  const quando = formatDistanceToNowStrict(new Date(item.created_at), { addSuffix: true, locale });
  return (
    <li
      className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-2xl bg-surface p-3.5 shadow-[0_0_0_1px_var(--color-border)]"
      data-testid="aviso-do-celular"
    >
      <span className={cn("grid size-10 place-items-center rounded-xl", CLASSE_DO_TOM[tom])}>
        <Icone size={20} aria-hidden />
      </span>
      <div className="min-w-0">
        {/* Título e corpo saem como vieram, nunca por `t()`: linhas do runtime com nome de cliente. */}
        <b className="block break-words text-[15.5px] leading-[1.3] text-text">{item.title}</b>
        <p className="mt-1 break-words text-sm text-text-muted">{item.body ?? kindLabel(item.kind, t)}</p>
        <time className="mt-1 block text-[12.5px] text-text-subtle" dateTime={item.created_at}>
          {quando}
        </time>
        <div className="mt-3 flex flex-wrap gap-2">
          {pedeDesfecho(item, podeResolver) ? (
            <ResultadoDoCompromisso
              compromissoId={item.ref_id!}
              hrefDoCompromisso={item.destination.estado === "disponivel" ? item.destination.href : null}
              onNavegar={() => undefined}
            />
          ) : (
            aberto &&
            item.destination.estado === "disponivel" && (
              <Link href={item.destination.href} className={botao(true)}>
                {t(item.destination.rotulo)}
              </Link>
            )
          )}
          {podeResolver &&
            (aberto ? (
              <button type="button" disabled={pendente} onClick={() => onStatus("resolved")} className={cn(botao(false), "disabled:opacity-60")}>
                {t("Marcar resolvido")}
              </button>
            ) : (
              <button type="button" disabled={pendente} onClick={() => onStatus("open")} className={cn(botao(false), "disabled:opacity-60")}>
                {t("Reabrir")}
              </button>
            ))}
        </div>
      </div>
    </li>
  );
}

/**
 * O ⋯ do cabeçalho de Avisos no celular: "Marcar todos resolvidos", com Desfazer. Só
 * aparece para quem resolve, com mais de um aberto e com a lista COMPLETA na mão
 * (menos que o limite da rota): só assim o Desfazer reabre tudo o que resolveu.
 */
export function AcoesDosAvisos() {
  const t = useT();
  const podeResolver = usePodeResolverAvisos();
  const [aberta, setAberta] = useState(false);
  const { nAbertos, listaCompleta, resolverTodos, marcarTodosResolvidos } = useCentralDeAvisos(t);
  if (!podeResolver || nAbertos < 2 || !listaCompleta) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-label={t("Ações dos avisos")}
        className="pele-foco grid size-(--mb-alvo) place-items-center rounded-full text-text hover:bg-hover"
      >
        <DotsThree size={22} weight="bold" aria-hidden />
      </button>
      <FolhaInferior aberto={aberta} aoMudar={setAberta} titulo={t("Avisos")}>
        <ItemDaFolha
          icone={CheckCircle}
          titulo={t("Marcar todos resolvidos")}
          apoio={`${nAbertos} ${t("em aberto")}`}
          aoTocar={() => {
            setAberta(false);
            if (!resolverTodos.isPending) marcarTodosResolvidos({ avisarErro: true });
          }}
        />
      </FolhaInferior>
    </>
  );
}
