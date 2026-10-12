"use client";
import type { ReactNode } from "react";

import type { InboxFiltersValue, InboxTab } from "@/components/inbox/InboxFilters";
import { ROTULO_DO_TIPO } from "@/components/inbox/filtros/chipsDosFiltros";
import { useT } from "@/hooks/i18n/useT";
import type { TipoDeCanal } from "@/lib/inbox/tipo-de-canal";
import { cn } from "@/lib/utils";

import { FolhaInferior } from "../FolhaInferior";
import type { AbaComContagem } from "./Conversas";

/** "Quem atende" (o protótipo) são as visões que a Inbox já tem, por quem manda. */
const QUEM_ATENDE: { tab: InboxTab; rotulo: string }[] = [
  { tab: "all", rotulo: "Todos" },
  { tab: "mine", rotulo: "Você" },
  { tab: "ai", rotulo: "Agente IA" },
  { tab: "unassigned", rotulo: "Sem dono" },
];

function Interruptor({ ligado, rotulo, apoio, aoMudar }: { ligado: boolean; rotulo: string; apoio?: string; aoMudar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={aoMudar}
      className="pele-foco flex min-h-(--mb-folha-item) w-full items-center gap-3.5 rounded-[14px] px-3 py-2 text-left hover:bg-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-text">{rotulo}</span>
        {apoio && <span className="block text-[13.5px] text-text-muted">{apoio}</span>}
      </span>
      <span aria-hidden className={cn("relative h-7 w-[46px] shrink-0 rounded-full transition-colors", ligado ? "pele-grad-contador bg-accent" : "bg-border-strong")}>
        <span className={cn("absolute top-[3px] left-[3px] size-[22px] rounded-full bg-white shadow-sm transition-transform", ligado && "translate-x-[18px]")} />
      </span>
    </button>
  );
}

function Chip({ ligado, children, aoTocar }: { ligado: boolean; children: ReactNode; aoTocar: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={ligado}
      onClick={aoTocar}
      className={cn(
        "relative flex h-(--mb-chip-altura) items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1",
        ligado ? "pele-grad-contador bg-accent text-accent-foreground" : "bg-surface-elevated text-text-muted shadow-[inset_0_0_0_1px_var(--color-border)]",
      )}
    >
      {children}
    </button>
  );
}

const ROTULO_DA_SECAO = "px-5 pt-3.5 pb-1 text-xs font-bold tracking-[0.06em] text-text-subtle uppercase";

/**
 * A folha de filtros do celular (o item 04 do protótipo): Só não lidas, Canal, Quem
 * atende, os filtros que o CRM tem a mais e o rodapé "Limpar" + "Ver N conversas".
 * Os filtros valem na hora (a lista e a contagem já estão por trás da folha); N é a
 * contagem da aba com TODOS os filtros (`fn_contagens_da_caixa`, migration 9049),
 * o mesmo predicado da lista. A busca por texto não entra no número (declarado na
 * rota de contagens).
 */
export function FolhaDeFiltros({
  aberta,
  aoMudar,
  value,
  onChange,
  abas,
  tiposDeCanal,
  maisFiltros,
  aoLimpar,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  value: InboxFiltersValue;
  onChange: (next: InboxFiltersValue) => void;
  abas: AbaComContagem[];
  /** Os tipos que a organização tem conectados (WhatsApp sempre). */
  tiposDeCanal: TipoDeCanal[];
  /** Número de WhatsApp, etiquetas e entrada do Instagram: o mesmo filtro do desktop. */
  maisFiltros: ReactNode;
  aoLimpar: () => void;
}) {
  const t = useT();
  const n = abas.find((a) => a.value === value.tab)?.count ?? 0;
  const quemAtende = QUEM_ATENDE.filter((q) => abas.some((a) => a.value === q.tab));

  return (
    <FolhaInferior aberto={aberta} aoMudar={aoMudar} titulo={t("Filtros")}>
      <Interruptor
        ligado={value.onlyUnread}
        rotulo={t("Só não lidas")}
        apoio={t("Esconde o que você já viu")}
        aoMudar={() => onChange({ ...value, onlyUnread: !value.onlyUnread })}
      />
      <p className={ROTULO_DA_SECAO}>{t("Canal")}</p>
      <div role="group" aria-label={t("Canal")} className="flex flex-wrap gap-2 px-3 pb-2">
        <Chip ligado={!value.canal} aoTocar={() => onChange({ ...value, canal: undefined })}>
          {t("Todos")}
        </Chip>
        {tiposDeCanal.map((tipo) => (
          <Chip key={tipo} ligado={value.canal === tipo} aoTocar={() => onChange({ ...value, canal: tipo })}>
            {ROTULO_DO_TIPO[tipo]}
          </Chip>
        ))}
      </div>
      <p className={ROTULO_DA_SECAO}>{t("Quem atende")}</p>
      <div role="group" aria-label={t("Quem atende")} className="flex flex-wrap gap-2 px-3 pb-2">
        {quemAtende.map((q) => (
          <Chip key={q.tab} ligado={value.tab === q.tab} aoTocar={() => onChange({ ...value, tab: q.tab })}>
            {t(q.rotulo)}
          </Chip>
        ))}
      </div>
      <p className={ROTULO_DA_SECAO}>{t("Mais filtros")}</p>
      <Interruptor
        ligado={!!value.semPasso}
        rotulo={t("Sem próximo passo")}
        aoMudar={() => onChange({ ...value, semPasso: !value.semPasso })}
      />
      <Interruptor
        ligado={!!value.onlyGroups}
        rotulo={t("Só grupos")}
        aoMudar={() => onChange({ ...value, onlyGroups: !value.onlyGroups })}
      />
      <div className="px-3 pt-1 pb-2">{maisFiltros}</div>
      <div className="sticky bottom-0 mt-2 flex gap-2.5 border-t border-border bg-surface px-2 pt-3">
        <button
          type="button"
          onClick={aoLimpar}
          className="pele-foco min-h-(--mb-alvo) flex-1 rounded-xl bg-surface-elevated text-[15px] font-bold text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]"
        >
          {t("Limpar")}
        </button>
        <button
          type="button"
          onClick={() => aoMudar(false)}
          className="pele-foco pele-grad-contador min-h-(--mb-alvo) flex-1 rounded-xl bg-accent text-[15px] font-bold text-accent-foreground"
        >
          {n === 1 ? t("Ver 1 conversa") : `${t("Ver")} ${n} ${t("conversas")}`}
        </button>
      </div>
    </FolhaInferior>
  );
}
