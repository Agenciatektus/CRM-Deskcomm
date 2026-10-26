"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConcluirEmbeddedSignup, useOfficialChannel } from "@/hooks/channels/useOfficialChannel";
import { useMetaEmbeddedSignup } from "@/hooks/channels/useMetaEmbeddedSignup";
import { useT } from "@/hooks/i18n/useT";
import { Warning } from "@/lib/ui/icons";

export interface ConfigDoPopup {
  appId: string;
  configId: string;
  configIdCoexistencia: string;
}

/** O aviso do modo Coexistence, o mesmo no cartão do passo 2 e no passo 3. */
export function AvisoCoexistence() {
  const t = useT();
  return (
    <div role="note" className="flex gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2">
      <Warning size={14} className="mt-0.5 shrink-0" aria-hidden />
      <p className="text-xs leading-relaxed text-text">
        {t("Oficial da Meta e mantém o app WhatsApp Business. A Meta pode restringir o número por até 24 h logo depois da conexão. O histórico de conversas ainda não é sincronizado.")}
      </p>
    </div>
  );
}

/**
 * Passo 3 do "Conectar com a Meta": o popup da Meta, no modo API Oficial ou Coexistence.
 * Coexistence exige o checkbox de ciência antes de o botão habilitar.
 */
export function ConectarComMeta({
  config,
  coexistencia,
  onConectado,
}: {
  config: ConfigDoPopup;
  coexistencia: boolean;
  onConectado: (telefone: string | null) => void;
}) {
  const t = useT();
  const { abrindo, abrir } = useMetaEmbeddedSignup(config);
  const concluir = useConcluirEmbeddedSignup();
  const jaConectado = useOfficialChannel().data?.data.connected === true;
  const [ciente, setCiente] = useState(false);
  const [nome, setNome] = useState<string | null>(null);

  const conectar = async () => {
    // Já existe canal oficial: o popup troca o token salvo, e a pessoa confirma antes.
    if (jaConectado && !window.confirm(t("Conectar com a Meta substitui o token que está salvo agora."))) return;
    const r = await abrir(coexistencia);
    if (!r.ok) {
      if (r.motivo === "sdk") toast.error(t("Não foi possível carregar o login da Meta. Tente de novo."));
      else if (r.motivo === "cancelado") toast.message(t("Conexão cancelada."));
      else toast.error(t("A Meta não retornou os dados do número. Refaça e conclua todos os passos."));
      return;
    }
    try {
      const res = await concluir.mutateAsync({
        code: r.code,
        waba_id: r.wabaId,
        phone_number_id: r.phoneNumberId,
        coexistencia: r.coexistencia,
      });
      setNome(res.data.displayName);
      toast.success(`${t("Conectado:")} ${res.data.displayName}`);
      onConectado(res.data.phoneNumber);
    } catch (e) {
      // A mensagem já vem do servidor, no idioma da pessoa.
      toast.error(e instanceof Error ? e.message : t("Não foi possível conectar. Tente de novo."));
    }
  };

  const ocupado = abrindo || concluir.isPending;
  const bloqueado = ocupado || (coexistencia && !ciente);
  return (
    <div className="flex flex-col gap-4">
      {coexistencia ? (
        <>
          <AvisoCoexistence />
          <label className="flex items-start gap-2 text-sm text-text">
            <input type="checkbox" className="mt-0.5" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
            <span>{t("Confirmo que estou ciente e quero prosseguir")}</span>
          </label>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-text">{t("Antes de conectar")}</p>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-text-muted">
            <li>{t("Portfólio empresarial da Meta verificado.")}</li>
            <li>{t("App WhatsApp Business atualizado no celular.")}</li>
            <li>{t("Número removido de qualquer outra plataforma comercial.")}</li>
          </ul>
        </div>
      )}
      <p className="text-xs text-text-muted">{t("A Meta cobra por conversa e por template; o CRM não soma taxa. Valores a confirmar.")}</p>
      <div role="status" aria-live="polite" className="text-xs text-text-muted">
        {abrindo ? t("Abrindo a Meta…") : concluir.isPending ? t("Conectando…") : nome ? `${t("Conectado:")} ${nome}` : null}
      </div>
      <Button type="button" onClick={() => void conectar()} disabled={bloqueado}>
        {coexistencia ? t("Conectar via Meta (Coexistence)") : t("Conectar com a Meta")}
      </Button>
    </div>
  );
}
