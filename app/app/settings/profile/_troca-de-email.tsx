"use client";
/**
 * A troca do e-mail de acesso, na tela de Perfil.
 *
 * O e-mail NÃO muda ao clicar: `trocarEmail` pede ao GoTrue, que manda o link de
 * confirmação (para o endereço novo e, com a troca segura, também para o atual).
 * A tela diz isso com todas as letras, porque o erro natural de quem acabou de
 * clicar é achar que já pode entrar com o endereço novo.
 */
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { trocarEmail, type TrocarEmailErro } from "@/app/actions/settings/trocarEmail";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

const ERROS: Record<TrocarEmailErro, string> = {
  unauthenticated: "Sua sessão expirou. Entre de novo para trocar o e-mail.",
  support_readonly: "Saia do acompanhamento para trocar o e-mail.",
  validation_failed: "Informe um e-mail válido.",
  same_email: "Este já é o seu e-mail.",
  mfa_required: "Confirme o segundo fator nesta sessão e tente de novo.",
  rate_limited: "Muitos pedidos de troca seguidos. Tente de novo em uma hora.",
  smtp_not_configured: "Esta instalação ainda não envia e-mails. Peça ao administrador para configurar o SMTP.",
  email_in_use: "Este e-mail já é usado por outra conta.",
  update_failed: "Não consegui pedir a troca agora. Tente de novo.",
};

export function TrocaDeEmail({ email, pendente }: { email: string; pendente: string | null }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState("");
  const [enviadoPara, setEnviadoPara] = useState<string | null>(pendente);
  const [isPending, startTransition] = useTransition();

  function pedir(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await trocarEmail({ email: novo });
      if (!r.ok) {
        toast.error(t(ERROS[r.error]));
        return;
      }
      setEnviadoPara(r.novoEmail);
      setAberto(false);
      setNovo("");
      toast.success(t("Enviamos o link de confirmação."));
    });
  }

  return (
    <Card className="space-y-3 p-6">
      <div className="space-y-2">
        <Label htmlFor="email">{t("Email")}</Label>
        <Input id="email" value={email} disabled />
      </div>
      {enviadoPara ? (
        <p className="text-sm text-text-muted" role="status" data-testid="troca-de-email-pendente">
          {t("Aguardando confirmação para")} <b className="text-text">{enviadoPara}</b>.{" "}
          {t(
            "Abra o link que enviamos para o novo endereço. Se chegar um link também no endereço atual, confirme nele: a troca só vale depois das confirmações.",
          )}
        </p>
      ) : null}
      {aberto ? (
        <form onSubmit={pedir} className="space-y-2">
          <Label htmlFor="novo_email">{t("Novo e-mail")}</Label>
          <Input
            id="novo_email"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={isPending}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={isPending || novo.trim().length === 0}>
              {isPending ? t("Enviando…") : t("Enviar link de confirmação")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setAberto(true)} className="w-full sm:w-auto">
            {t("Trocar e-mail")}
          </Button>
        </div>
      )}
    </Card>
  );
}
