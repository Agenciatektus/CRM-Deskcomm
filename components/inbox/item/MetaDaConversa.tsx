"use client";

import { Clock } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import type { Comando } from "@/lib/inbox/comando-da-conversa";
import { esperaDaConversa } from "@/lib/inbox/comando-da-conversa";
import { CLASSE_DO_TOM, tomDaEspera } from "@/lib/inbox/tom-da-espera";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { cn } from "@/lib/utils";

import { waitingLabel } from "./tempo-da-linha";

/** A pílula do visual v2: mesma altura para espera, dono e selos. */
const PILULA =
  "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium";

interface Props {
  conversation: ConversationWithContact;
  comando: Comando;
  /** Posição 1-based na Fila; ausente fora dela. */
  queuePosition?: number;
  mostrarAtendente?: boolean;
  /** Número (ou nome) do canal da EMPRESA, já resolvido pelo item. */
  rotuloCanal: string | null;
  mostrarCanal?: boolean;
  /** Quem está logado: o dono que é a própria pessoa vira "Você". */
  meuUserId?: string | null;
}

/**
 * O rótulo do DONO, na régua de `comandoDaConversa` (a mesma do cabeçalho).
 *
 * "Automático", e não "IA": é a palavra do ator em todo o produto, travada por
 * `handoff-por-orcamento.test.ts`. Encerrada não ganha pílula: "Encerrada" já é
 * a aba, e repetir em cada linha é o ruído que a regra do `mostrarAtendente`
 * existe para evitar.
 */
function donoDaConversa(
  comando: Comando,
  meuUserId: string | null | undefined,
  t: (texto: string) => string,
): { rotulo: string; classe: string } | null {
  switch (comando.quem) {
    case "humano":
      return {
        rotulo:
          meuUserId && comando.userId === meuUserId ? t("Você") : (comando.nome ?? t("Atendente")),
        classe: "border-border bg-surface-elevated text-text-muted",
      };
    case "automatico":
      return { rotulo: t("Automático"), classe: "border-transparent bg-accent-soft text-accent" };
    case "aguardando":
    case "ninguem":
      // Neutro de propósito: "sem dono" é o estado normal da Fila, e pintá-lo de
      // alerta em toda linha gastaria a cor que a pílula de ESPERA usa para
      // dizer quem está esperando demais.
      return { rotulo: t("Sem dono"), classe: "border-dashed border-border-strong text-text-muted" };
    default:
      return null;
  }
}

/**
 * A linha de META do item: espera, dono, etiquetas e os selos de sempre.
 *
 * Saiu de `ConversationListItem.tsx` para o item caber em 300 linhas. Tudo o que
 * a linha mostrava antes continua aqui, na mesma condição: posição na fila,
 * etiquetas (duas + o resto), dono, Direct/Comentário, canal, Bloqueado e
 * Anonimizado. O que mudou foi o desenho (pílulas) e a cor da espera.
 */
export function MetaDaConversa({
  conversation,
  comando,
  queuePosition,
  mostrarAtendente,
  rotuloCanal,
  mostrarCanal,
  meuUserId,
}: Props) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const c = conversation.contacts ?? null;
  const tags = c?.tags ?? [];
  const visibleTags = tags.slice(0, 2);
  const overflow = tags.length - visibleTags.length;
  const naFila = queuePosition !== undefined;
  const dono = mostrarAtendente ? donoDaConversa(comando, meuUserId, t) : null;

  // POR ONDE entrou, que é diferente da REDE. O `ChannelLogo` sobre o avatar já
  // diz "Instagram"; este selo diz se foi Direct ou comentário, porque
  // comentário é público e não pede atendimento, Direct é conversa privada.
  const entrada = conversation.instagram_entrada ?? null;
  const rotuloEntrada =
    entrada === "direct" ? t("Direct") : entrada === "comentario" ? t("Comentário") : null;

  const temAlgo =
    naFila ||
    dono !== null ||
    visibleTags.length > 0 ||
    rotuloEntrada !== null ||
    (mostrarCanal && rotuloCanal != null) ||
    Boolean(c?.is_blocked) ||
    Boolean(c?.is_anonymized);
  if (!temAlgo) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {naFila && (
        <>
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-soft px-1 text-[10px] font-medium tabular-nums text-accent"
            aria-label={`${t("Posição")} ${queuePosition} ${t("na fila")}`}
          >
            {queuePosition}º
          </span>
          {/* A cor sai do TEMPO de espera (`tomDaEspera`), com a MESMA régua do
              texto ao lado (`esperaDaConversa`): cor e número não podem discordar. */}
          <span
            className={cn(
              PILULA,
              "border-transparent",
              CLASSE_DO_TOM[tomDaEspera(esperaDaConversa(conversation))],
            )}
          >
            <Clock size={12} aria-hidden />
            {waitingLabel(conversation, t, localeDaData)}
          </span>
        </>
      )}
      {dono && <span className={cn(PILULA, dono.classe)}>{dono.rotulo}</span>}
      {visibleTags.map((tag) => (
        <ChipDeEtiqueta key={tag} tag={tag} className="h-5 px-1.5 text-[11px]" />
      ))}
      {overflow > 0 && <span className="text-[11px] text-text-muted">+{overflow}</span>}
      {rotuloEntrada && (
        <Badge
          variant="outline"
          className="h-5 gap-1 px-1.5 text-[11px] font-normal text-text-muted"
          title={`${t("Entrou por")} ${rotuloEntrada}`}
        >
          {rotuloEntrada}
        </Badge>
      )}
      {mostrarCanal && rotuloCanal && (
        <Badge
          variant="outline"
          className="h-5 gap-1 px-1.5 text-[11px] font-normal text-text-muted"
          title={`${t("Entrou por")} ${rotuloCanal}`}
        >
          {rotuloCanal}
        </Badge>
      )}
      {c?.is_blocked && (
        <Badge variant="destructive" className="h-5 px-1.5 text-[11px]">
          {t("Bloqueado")}
        </Badge>
      )}
      {c?.is_anonymized && (
        <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
          {t("Anonimizado")}
        </Badge>
      )}
    </div>
  );
}
