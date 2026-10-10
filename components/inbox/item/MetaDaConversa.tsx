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

import { esperaCurta, waitingLabel } from "./tempo-da-linha";

/**
 * A pílula do visual v2: mesma altura para espera, dono e selos. 22px e 12px
 * semibold são as medidas do `.pill` do protótipo; com 20px/11px o dono e a
 * espera sumiam ao lado do nome, que é justamente o que se lê primeiro.
 */
const PILULA =
  "inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs font-semibold";
/** A etiqueta como chip com CONTORNO (o `.tag` do protótipo): arredondada, para não
 *  se confundir com a pílula de dono/espera, que é retangular. */
const CHIP_DA_ETIQUETA =
  // `block truncate` no lugar do `inline-flex` do Badge: texto solto num flex
  // não ganha reticências. A etiqueta longa encolhe até 9rem e mostra o nome
  // inteiro no `title`, em vez de empurrar o resto da linha para baixo.
  "block h-[22px] min-w-0 max-w-[9rem] shrink truncate rounded-full border border-border bg-surface px-2 py-0 text-xs font-normal leading-5 text-text-muted";

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
 * "IA" (L19 da auditoria; decisão do Peterson, como o "Devolver à IA"). A
 * encerrada SEM dono ganha a pílula "Fechada": na aba Todas ela se mistura às
 * abertas. A pílula só aparece onde o dono discrimina (`mostrarAtendente`).
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
        classe: "border-border bg-surface text-text-muted",
      };
    case "automatico":
      // L19: "IA", a palavra do protótipo (e do "Devolver à IA" do cabeçalho).
      return { rotulo: t("IA"), classe: "border-transparent bg-accent-soft text-accent-700 dark:text-accent-300" };
    case "encerrada":
      return { rotulo: t("Fechada"), classe: "border-border bg-surface-elevated text-text-subtle" };
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
  // L21: uma etiqueta e "+N", como no protótipo: duas já empurravam a linha.
  const visibleTags = tags.slice(0, 1);
  const overflow = tags.length - visibleTags.length;
  const naFila = queuePosition !== undefined;
  const dono = mostrarAtendente ? donoDaConversa(comando, meuUserId, t) : null;
  /*
   * A ESPERA FORA DA FILA, só quando o cliente ESPERA de fato: `awaiting_since`
   * é a mesma régua da faixa do cabeçalho ("Esperando há…"). Sem ela a linha não
   * afirma espera nenhuma (o fallback de `esperaDaConversa` para a última
   * mensagem ou a criação serve à ORDEM da Fila, não a um alarme). Encerrada não
   * espera ninguém. Na Fila a pílula longa de sempre continua (o e2e de fila lê
   * "Aguardando").
   */
  const esperaDesde =
    !naFila && comando.quem !== "encerrada" ? (conversation.awaiting_since ?? null) : null;
  const espera = esperaCurta(esperaDesde);
  const mostraEspera = espera !== null;

  // POR ONDE entrou, que é diferente da REDE. O `ChannelLogo` sobre o avatar já
  // diz "Instagram"; este selo diz se foi Direct ou comentário, porque
  // comentário é público e não pede atendimento, Direct é conversa privada.
  const entrada = conversation.instagram_entrada ?? null;
  const rotuloEntrada =
    entrada === "direct" ? t("Direct") : entrada === "comentario" ? t("Comentário") : null;

  const temAlgo =
    naFila ||
    mostraEspera ||
    dono !== null ||
    visibleTags.length > 0 ||
    rotuloEntrada !== null ||
    (mostrarCanal && rotuloCanal != null) ||
    Boolean(c?.is_blocked) ||
    Boolean(c?.is_anonymized);
  if (!temAlgo) return null;

  return (
    // Uma linha só sempre que couber: gap de 4px e etiquetas que encolhem (com
    // reticências) antes de quebrar. Com as pílulas de 22px do protótipo numa
    // lista mais estreita que a dele, dono + uma etiqueta longa já não cabiam
    // lado a lado e cada chip descia para a sua linha.
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {naFila && (
        <>
          <span
            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent-soft px-1 text-[11px] font-semibold tabular-nums text-accent"
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
      {espera && esperaDesde && (
        <span
          className={cn(PILULA, "border-transparent", CLASSE_DO_TOM[tomDaEspera(esperaDesde)])}
          title={`${t("Esperando há")} ${espera}`}
          data-testid="item-espera"
          data-tom={tomDaEspera(esperaDesde)}
        >
          <Clock size={12} aria-hidden />
          {espera}
        </span>
      )}
      {dono && <span className={cn(PILULA, dono.classe)}>{dono.rotulo}</span>}
      {visibleTags.map((tag) => (
        <ChipDeEtiqueta key={tag} tag={tag} title={tag} className={CHIP_DA_ETIQUETA} />
      ))}
      {overflow > 0 && <span className="text-xs text-text-muted">+{overflow}</span>}
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
