"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";
import { useAuthOpcional } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { formatarDecorrido } from "@/lib/channels/janela";
import { comandoDaConversa } from "@/lib/inbox/comando-da-conversa";
import { Robot, UserCircle, UsersThree } from "@/lib/ui/icons";

export type QuemAtende = "ia" | "ninguem" | "outro";

/**
 * Quem atende a conversa, do ponto de vista de quem vai escrever: a IA,
 * ninguém, ou OUTRA pessoa. `null` quando é você, quando a conversa acabou ou
 * quando não dá para saber (sem sessão, como na lista desenhada fora do app).
 *
 * A régua é `comandoDaConversa`, a mesma do cabeçalho e da lista.
 */
export function useQuemAtende(conversa: ConversationWithContact | undefined): {
  quem: QuemAtende | null;
  nome: string | null;
} {
  const automaticoDaOrg = useAutomaticoAtivo();
  const sessao = useAuthOpcional();
  if (!conversa) return { quem: null, nome: null };
  const { comando } = comandoDaConversa({
    status: conversa.status,
    assigned_to_user_id: conversa.assigned_to_user_id,
    assigned_to_user_name: conversa.assigned_to_user_name ?? null,
    assignee_kind: conversa.assignee_kind ?? null,
    bot_silenced_until: conversa.bot_silenced_until ?? null,
    last_handoff_reason: conversa.last_handoff_reason ?? null,
    force_human: conversa.contacts?.force_human ?? null,
    is_blocked: conversa.contacts?.is_blocked ?? null,
    is_group: conversa.is_group ?? false,
    automaticoDaOrg: automaticoDaOrg.data,
  });
  if (comando.quem === "automatico") return { quem: "ia", nome: null };
  if (comando.quem === "aguardando" || comando.quem === "ninguem") return { quem: "ninguem", nome: null };
  if (comando.quem === "humano" && sessao && comando.userId !== sessao.user.id)
    return { quem: "outro", nome: comando.nome ?? null };
  return { quem: null, nome: null };
}

/**
 * A FAIXA DE QUEM ATENDE, no lugar da caixa do composer (C4-C6 da auditoria).
 *
 * Enquanto você não é o dono, a faixa SUBSTITUI a caixa de resposta, como no
 * protótipo: escrever por cima da IA ou de um colega passa a ser uma decisão
 * consciente. O gesto principal é "Assumir e responder" (o MESMO `claim` do
 * cabeçalho; desde a 0173, assumir cala o automático).
 *
 * NÃO TRAVA NINGUÉM: a regra do servidor continua a de sempre (qualquer
 * atendente responde, e só a empresa que ligou "a conversa fica com quem
 * atendeu" passa o dono no envio). Por isso há sempre a saída "Responder sem
 * assumir", que devolve a caixa como era, e a aba "Nota interna" continua
 * livre. Quando OUTRA pessoa atende, não há "puxar": o cabeçalho também não
 * oferece assumir conversa com dono, e a troca de dono é a Transferência.
 *
 * ⚠️ O rótulo não é "Assumir": duas specs e2e clicam o botão do cabeçalho com
 * `{ name: "Assumir", exact: true }` (ver `PassagemCard`).
 */
export function FaixaDoDono({
  conversa,
  quem,
  nome,
  onAssumiu,
  onResponderSemAssumir,
  onNota,
}: {
  conversa: ConversationWithContact;
  quem: QuemAtende;
  nome: string | null;
  /** Depois do claim aceito: a caixa volta e recebe o foco. */
  onAssumiu: () => void;
  onResponderSemAssumir: () => void;
  onNota: () => void;
}) {
  const t = useT();
  const claim = useClaimConversation();
  const assumir = () =>
    claim.mutate(
      { conversation_id: conversa.id, expected_assignee: conversa.assigned_to_user_id ?? null },
      { onSuccess: onAssumiu },
    );

  return (
    <div
      data-testid="faixa-do-dono"
      data-quem={quem}
      className="pele-ruido flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-surface py-2.5 pl-3.5 pr-2.5 shadow-xs"
    >
      {quem === "ia" ? (
        <Robot size={18} weight="duotone" aria-hidden className="shrink-0 text-accent-700 dark:text-accent-300" />
      ) : quem === "outro" ? (
        <UsersThree size={18} weight="duotone" aria-hidden className="shrink-0 text-text-muted" />
      ) : (
        <UserCircle size={18} weight="duotone" aria-hidden className="shrink-0 text-warning" />
      )}
      <p className="min-w-0 flex-1 basis-56 text-sm text-text-muted">
        {quem === "ia" ? (
          <>
            <b className="font-semibold text-text">{t("A IA está atendendo.")}</b>{" "}
            {t("Ao assumir, o automático para nesta conversa.")}
          </>
        ) : quem === "outro" ? (
          <>
            <b className="font-semibold text-text">
              {nome ?? t("Outra pessoa")} {t("está atendendo.")}
            </b>{" "}
            {t("Deixe uma nota interna para ela.")}
          </>
        ) : (
          <>
            <b className="font-semibold text-text">{t("Ninguém assumiu esta conversa.")}</b>{" "}
            <EsperaDesde desde={conversa.awaiting_since ?? null} rotulo={t("O cliente espera há")} />
          </>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-text-muted"
          onClick={quem === "outro" ? onNota : onResponderSemAssumir}
        >
          {quem === "outro" ? t("Escrever nota") : t("Responder sem assumir")}
        </Button>
        {quem === "outro" ? (
          <Button type="button" size="sm" variant="outline" onClick={onResponderSemAssumir}>
            {t("Responder mesmo assim")}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={assumir} disabled={claim.isPending}>
            {claim.isPending ? t("Assumindo...") : t("Assumir e responder")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** C6: "O cliente espera há 14m", na unidade da faixa de status do cabeçalho. */
function EsperaDesde({ desde, rotulo }: { desde: string | null; rotulo: string }) {
  const decorrido = tempoDesde(desde);
  if (decorrido === null) return null;
  return (
    <span className="text-warning-fg">
      {rotulo} {decorrido}.
    </span>
  );
}

function tempoDesde(desde: string | null, agora: Date = new Date()): string | null {
  if (!desde) return null;
  const ms = agora.getTime() - Date.parse(desde);
  return Number.isFinite(ms) && ms >= 0 ? formatarDecorrido(ms) : null;
}

interface AcoesDaFaixa {
  onAssumiu: () => void;
  onResponderSemAssumir: () => void;
  onNota: () => void;
}

/**
 * A caixa de resposta (`children`) OU a faixa de quem atende no lugar dela.
 *
 * Sem `conversa` (modo nota, "responder sem assumir", ou composer fora da
 * Inbox) devolve a caixa sem perguntar nada: a régua de quem atende só roda
 * quando há conversa para julgar, e quem desenha o composer sem sessão
 * (testes, vitrines) não precisa de provider de autenticação.
 */
export function CaixaOuFaixaDoDono({
  conversa,
  children,
  ...acoes
}: AcoesDaFaixa & { conversa: ConversationWithContact | null | undefined; children: ReactNode }) {
  if (!conversa) return <>{children}</>;
  return (
    <Decisor conversa={conversa} {...acoes}>
      {children}
    </Decisor>
  );
}

function Decisor({
  conversa,
  children,
  ...acoes
}: AcoesDaFaixa & { conversa: ConversationWithContact; children: ReactNode }) {
  const { quem, nome } = useQuemAtende(conversa);
  if (quem === null) return <>{children}</>;
  return <FaixaDoDono conversa={conversa} quem={quem} nome={nome} {...acoes} />;
}
