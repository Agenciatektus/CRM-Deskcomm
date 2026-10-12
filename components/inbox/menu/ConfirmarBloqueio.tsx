"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useBlockContact } from "@/hooks/contacts/useBlockContact";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { roleAtLeast } from "@/lib/auth/types";
import { avisarComDesfazer } from "@/lib/ui/aviso-com-desfazer";

/**
 * BLOQUEAR O CONTATO, com a confirmação DENTRO do menu (o `.confirm` do quadro
 * DS), e não numa janela modal. Bloquear vale para a empresa inteira (nenhum
 * envio sai mais, nem da IA, nem de campanha); por isso a pergunta continua, e o
 * título nomeia o alvo. Motivo opcional (até 280 caracteres, aparado).
 *
 * Depois de bloquear, o aviso embaixo oferece Desfazer (`/unblock`) para quem
 * pode desbloquear: a rota exige admin, e oferecer a quem ela recusaria seria
 * prometer o que não se cumpre.
 */
export function ConfirmarBloqueio({ contactId, nome, onCancelar, onConcluido }: {
  contactId: string;
  nome: string;
  onCancelar: () => void;
  onConcluido: () => void;
}) {
  const t = useT();
  const { activeOrg } = useAuth();
  const bloquear = useBlockContact();
  const [motivo, setMotivo] = useState("");
  const podeDesbloquear = !!activeOrg && roleAtLeast(activeOrg.role, "admin");

  function confirmar() {
    bloquear.mutate(
      { contactId, motivo: motivo.trim() || undefined },
      {
        onSuccess: () => {
          onConcluido();
          const mensagem = `${nome} ${t("foi bloqueado.")}`;
          if (podeDesbloquear) {
            avisarComDesfazer(mensagem, t("Desfazer"), () =>
              apiClient.post(`/api/v1/contacts/${contactId}/unblock`, {}),
            );
          } else {
            toast.success(mensagem);
          }
        },
      },
    );
  }

  return (
    <div className="px-2 pb-2 pt-1.5" data-testid="confirmar-bloqueio" onKeyDown={(e) => e.stopPropagation()}>
      <p className="mb-2 whitespace-normal text-[13.5px] text-text-muted">
        <b className="text-text">{`${t("Bloquear")} ${nome}?`}</b>{" "}
        {t("Nenhuma mensagem sai mais para este contato, nem da IA nem de campanhas. Só um admin desbloqueia.")}
      </p>
      <Input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={280}
        placeholder={t("Motivo (opcional)")}
        aria-label={t("Motivo (opcional)")}
      />
      <div className="mt-3 flex justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={onCancelar} disabled={bloquear.isPending}>
          {t("Cancelar")}
        </Button>
        <Button size="sm" variant="destructive" onClick={confirmar} disabled={bloquear.isPending}>
          {t("Bloquear")}
        </Button>
      </div>
    </div>
  );
}
