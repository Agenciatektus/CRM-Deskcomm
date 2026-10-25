"use client";

import { format, isToday, isTomorrow } from "date-fns";

import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { classeDaCorDoAvatar } from "@/lib/inbox/cor-do-avatar";
import { primeiroNome } from "@/lib/kanban/identidade-do-card";
import type { OwnerDisplay } from "@/lib/kanban/owner";
import { rotuloDoTempo, type TempoNaEtapa } from "@/lib/kanban/tempo-na-etapa";
import { duracaoCurta, esperandoDesde, tomDaEsperaDoFunil } from "@/lib/kanban/ordem-do-funil";
import { CLASSE_DO_TOM } from "@/lib/inbox/tom-da-espera";
import type { Lead } from "@/lib/types/leads";
import { CalendarBlank, Clock, Flag, Hourglass, Megaphone, Plus } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { OwnerBadge, ownerInitials } from "./OwnerBadge";
import { FotoDaPessoa } from "@/components/fotos/FotoDaPessoa";

/** Até 2 etiquetas e um "+N" com a lista completa no título. */
export function EtiquetasDoCard({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  const resto = tags.slice(2);
  return (
    <span className="flex flex-wrap gap-1">
      {tags.slice(0, 2).map((tag) => (
        <span
          key={tag}
          className="inline-flex h-5.5 max-w-full items-center truncate rounded-full border border-border bg-surface px-2 text-xs text-text-muted"
        >
          {tag}
        </span>
      ))}
      {resto.length > 0 && (
        <span
          title={resto.join(", ")}
          className="inline-flex h-5.5 items-center rounded-full border border-border bg-surface px-2 text-xs font-semibold text-text-subtle"
        >
          +{resto.length}
        </span>
      )}
    </span>
  );
}

/** Texto do selo de anúncio: campanha e anúncio só entram quando existem. */
export function rotuloDoAnuncio(
  lead: Pick<Lead, "contact_campanha" | "contact_anuncio">,
  t: (s: string) => string,
): string | null {
  const { contact_campanha: campanha, contact_anuncio: anuncio } = lead;
  if (!campanha && !anuncio) return null;
  return [
    t("Veio de anúncio"),
    campanha && `${t("Campanha")}: ${campanha}`,
    anuncio && `${t("Anúncio")}: ${anuncio}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Selo discreto de negócio vindo de anúncio; detalhe no título e no aria-label, focável por teclado. */
export function AnuncioDoCard({ lead }: { lead: Pick<Lead, "contact_campanha" | "contact_anuncio"> }) {
  const t = useT();
  const rotulo = rotuloDoAnuncio(lead, t);
  if (!rotulo) return null;
  return (
    <span
      tabIndex={0}
      role="img"
      title={rotulo}
      aria-label={rotulo}
      data-testid="selo-de-anuncio"
      className="inline-flex h-5.5 w-fit items-center gap-1 rounded-full border border-border bg-surface px-2 text-xs text-text-muted focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Megaphone size={12} aria-hidden />
      {t("Anúncio")}
    </span>
  );
}

const DIA_MS = 86_400_000;

/**
 * O próximo passo: a tarefa aberta mais urgente do negócio (`crm_tasks`).
 * Com prazo: cinza. Atrasada: faixa vermelha com os dias. Sem tarefa: pílula
 * tracejada. `undefined` = não carregou (a linha não aparece, para não afirmar
 * "sem próximo passo" sem saber).
 */
export function ProximoPassoDoCard({
  passo,
  agora = new Date(),
}: {
  passo: Lead["proximo_passo"];
  agora?: Date;
}) {
  const t = useT();
  const locale = useLocaleDeData();
  if (passo === undefined) return null;
  const base = "flex min-h-7.5 items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px]";
  if (passo === null) {
    return (
      <span className={cn(base, "border border-dashed border-border-strong text-text-subtle")}>
        <Plus size={14} aria-hidden />
        <span>{t("Sem próximo passo")}</span>
      </span>
    );
  }
  const prazo = passo.prazo ? new Date(passo.prazo) : null;
  const atraso = prazo ? agora.getTime() - prazo.getTime() : -1;
  if (prazo && atraso > 0) {
    const dias = Math.floor(atraso / DIA_MS);
    return (
      <span className={cn(base, "bg-error-bg font-semibold text-error-fg")}>
        <Clock size={14} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{passo.titulo}</span>
        <b className="whitespace-nowrap">
          {dias >= 1 ? `${t("Atrasada")} ${dias} ${dias === 1 ? t("dia") : t("dias")}` : t("Atrasada")}
        </b>
      </span>
    );
  }
  const quando = prazo
    ? isToday(prazo)
      ? `${t("Hoje")} ${format(prazo, "HH:mm")}`
      : isTomorrow(prazo)
        ? `${t("Amanhã")} ${format(prazo, "HH:mm")}`
        : format(prazo, "EEE d/MM HH:mm", { locale })
    : null;
  return (
    <span className={cn(base, "border border-border bg-surface-elevated text-text-muted")}>
      <CalendarBlank size={14} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{passo.titulo}</span>
      {quando && <time className="whitespace-nowrap font-semibold text-text">{quando}</time>}
    </span>
  );
}

/** "há 3 dias" neutro; "Parado há 6 dias" âmbar; no dobro do limite, vermelho. */
export function TempoDoCard({ tempo }: { tempo: TempoNaEtapa | null }) {
  const t = useT();
  if (!tempo) return <span />;
  const parado = tempo.nivel !== "neutro";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.25 whitespace-nowrap",
        parado && "rounded-md px-1.75 py-0.5 font-bold",
        tempo.nivel === "alerta" && "bg-warning-bg text-warning-fg",
        tempo.nivel === "critico" && "bg-error-bg text-error-fg",
      )}
    >
      {parado ? <Flag size={14} aria-hidden /> : <Clock size={14} aria-hidden />}
      {rotuloDoTempo(tempo, t)}
    </span>
  );
}

/** Avatar de 20 px e primeiro nome; nome completo no título. Agente: o selo do agente. */
export function ResponsavelDoCard({ owner }: { owner: OwnerDisplay }) {
  const t = useT();
  if (owner.kind === "ai") {
    return <OwnerBadge ownerKind="ai" ownerName={owner.name} agentVersion={owner.agentVersion} compacto />;
  }
  if (!owner.kind) {
    return (
      <span className="whitespace-nowrap rounded-full border border-dashed border-border-strong px-2 py-px text-text-subtle">
        {t("Sem responsável")}
      </span>
    );
  }
  const nome = owner.name ?? t("Responsável");
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-text-muted"
      title={`${t("Responsável")}: ${nome}`}
    >
      <FotoDaPessoa
        userId={owner.userId}
        iniciais={ownerInitials(nome)}
        className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[9.5px] font-bold", classeDaCorDoAvatar(nome))}
      />
      <span className="sr-only">{t("Responsável")}: </span>
      <span className="truncate">{primeiroNome(nome)}</span>
    </span>
  );
}

/** "Esperando há": azul até 1 h, âmbar até 4 h, vermelho acima; "Respondida" quando a bola está com o cliente. */
export function EsperaDoLead({ lead, agora, comRotulo = false }: { lead: Lead; agora: Date; comRotulo?: boolean }) {
  const t = useT();
  const desde = esperandoDesde(lead);
  if (!desde) return <span className="text-text-subtle">{lead.conversa ? t("Respondida") : ""}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.75 py-0.5 font-semibold whitespace-nowrap", CLASSE_DO_TOM[tomDaEsperaDoFunil(desde, agora)])}>
      <Hourglass size={14} aria-hidden />
      <span className={comRotulo ? undefined : "sr-only"}>{t("Esperando há")} </span>
      {duracaoCurta(desde, agora, t)}
    </span>
  );
}
