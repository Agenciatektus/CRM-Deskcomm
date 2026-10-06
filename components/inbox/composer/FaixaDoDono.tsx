"use client";

import { Button } from "@/components/ui/button";
import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";
import { useT } from "@/hooks/i18n/useT";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { comandoDaConversa } from "@/lib/inbox/comando-da-conversa";
import { Robot, UserCircle } from "@/lib/ui/icons";

/**
 * A FAIXA DE QUEM ATENDE, acima da caixa do composer.
 *
 * Quem escreve precisa saber, ANTES de escrever, se está falando por cima de
 * alguém. A regra de "quem manda" é a mesma do cabeçalho e da lista
 * (`comandoDaConversa`, espelho dos gates do motor); aqui ela só escolhe a
 * frase e o gesto:
 *
 * - **a IA atende** (`automatico`): avisa que assumir para o automático, com o
 *   botão "Assumir a conversa";
 * - **ninguém assumiu** (`aguardando` ou `ninguem`): convida a puxar para si;
 * - **você atende**, outra pessoa atende ou a conversa acabou: nada. A
 *   primeira é o estado normal de quem responde; as outras já são ditas pelo
 *   cabeçalho, e repetir aqui seria barulho em cima da caixa.
 *
 * O gesto é o MESMO `claim` do cabeçalho e do cartão da passagem (uma rota, um
 * efeito). Desde a migration 0173 assumir já cala o automático, por isso "Ao
 * assumir, o automático para" é uma promessa que a rota cumpre.
 *
 * ⚠️ O rótulo é "Assumir a conversa", e não "Assumir": duas specs e2e clicam
 * o botão do cabeçalho com `{ name: "Assumir", exact: true }`, e um segundo
 * botão com o mesmo nome as faria falhar por ambiguidade (ver `PassagemCard`).
 */
export function FaixaDoDono({ conversa }: { conversa: ConversationWithContact }) {
  const t = useT();
  const automaticoDaOrg = useAutomaticoAtivo();
  const claim = useClaimConversation();
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

  const ia = comando.quem === "automatico";
  if (!ia && comando.quem !== "aguardando" && comando.quem !== "ninguem") return null;

  const assumir = () =>
    claim.mutate({ conversation_id: conversa.id, expected_assignee: conversa.assigned_to_user_id ?? null });

  return (
    <div
      data-testid="faixa-do-dono"
      data-quem={ia ? "ia" : "ninguem"}
      className="mb-2 flex items-center gap-3 rounded-2xl border border-border bg-surface py-2 pl-3.5 pr-2 shadow-xs"
    >
      {ia ? (
        <Robot size={18} weight="duotone" aria-hidden className="shrink-0 text-accent-700 dark:text-accent-300" />
      ) : (
        <UserCircle size={18} weight="duotone" aria-hidden className="shrink-0 text-warning" />
      )}
      <p className="min-w-0 flex-1 text-sm text-text-muted">
        {ia ? (
          <>
            <b className="font-semibold text-text">{t("A IA está atendendo.")}</b>{" "}
            {t("Ao assumir, o automático para.")}
          </>
        ) : (
          <b className="font-semibold text-text">{t("Ninguém assumiu esta conversa.")}</b>
        )}
      </p>
      <Button type="button" size="sm" onClick={assumir} disabled={claim.isPending} className="shrink-0">
        {claim.isPending ? t("Assumindo...") : ia ? t("Assumir a conversa") : t("Puxar para mim")}
      </Button>
    </div>
  );
}
