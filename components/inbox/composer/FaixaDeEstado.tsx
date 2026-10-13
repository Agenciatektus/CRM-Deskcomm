"use client";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useAuthOpcional } from "@/hooks/auth/AuthProvider";
import { useUnblockContact } from "@/hooks/contacts/useUnblockContact";
import { useT } from "@/hooks/i18n/useT";
import { useReopenConversation } from "@/hooks/inbox/useCloseConversation";
import { roleAtLeast } from "@/lib/auth/types";
import { Prohibit, Archive } from "@/lib/ui/icons";

const FAIXA = "pele-ruido flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-surface py-2.5 pl-3.5 pr-2.5 text-sm text-text-muted";

/**
 * C7 da auditoria: conversa fechada não mostra mais uma caixa apagada, e sim a
 * faixa com "Reabrir" (o MESMO `reopen` do cabeçalho, com a revisão do serviço
 * para não reabrir por cima de outra mudança).
 */
export function FaixaDeConversaFechada({
  conversationId,
  revisao,
}: {
  conversationId: string;
  revisao: number | null | undefined;
}) {
  const t = useT();
  const sessao = useAuthOpcional();
  const reabrir = useReopenConversation();
  // Quem só lê (`viewer`) não reabre: a mesma régua do cabeçalho (P2 da #154).
  const podeReabrir = roleAtLeast(sessao?.activeOrg?.role ?? null, "agent");
  return (
    <div className={FAIXA} data-testid="faixa-conversa-fechada">
      <Archive size={18} aria-hidden className="shrink-0 text-text-subtle" />
      <p className="min-w-0 flex-1">
        <b className="font-semibold text-text">{t("Esta conversa está fechada.")}</b>{" "}
        {podeReabrir ? t("Reabra para responder.") : null}
      </p>
      {podeReabrir && (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={reabrir.isPending}
        onClick={() => reabrir.mutate({ conversation_id: conversationId, expected_revision: revisao ?? undefined })}
      >
        {t("Reabrir")}
      </Button>
      )}
    </div>
  );
}

/**
 * C8 da auditoria: contato bloqueado mostra a faixa com "Desbloquear". O botão
 * só existe para quem a rota aceita (`admin`, `POST /contacts/:id/unblock`):
 * para os outros a faixa só explica, como antes.
 */
export function FaixaDeContatoBloqueado({
  contatoId,
  conversationId,
  motivo,
}: {
  contatoId: string;
  conversationId: string;
  motivo: string;
}) {
  const t = useT();
  const sessao = useAuthOpcional();
  const qc = useQueryClient();
  const desbloquear = useUnblockContact(contatoId);
  const podeDesbloquear = roleAtLeast(sessao?.activeOrg?.role ?? null, "admin");
  return (
    <div className={FAIXA} data-testid="faixa-contato-bloqueado">
      <Prohibit size={18} aria-hidden className="shrink-0 text-error-fg" />
      <p className="min-w-0 flex-1">{motivo}</p>
      {podeDesbloquear && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={desbloquear.isPending}
          onClick={() =>
            desbloquear.mutate(undefined, {
              // A conversa aberta lê `contacts.is_blocked` da própria consulta.
              onSuccess: () => void qc.invalidateQueries({ queryKey: ["conversation", conversationId] }),
            })
          }
        >
          {t("Desbloquear")}
        </Button>
      )}
    </div>
  );
}
