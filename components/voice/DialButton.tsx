"use client";
import { Button } from "@/components/ui/button";
import { Phone } from "@/lib/ui/icons";
import { useVoiceCall } from "@/components/voice/VoiceCallContext";
import { useVoiceSessionStatus } from "@/hooks/voice/useVoiceSessionStatus";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  contactId: string;
  /** Contato sem telefone não tem pra onde ligar — o chamador já sabe disso. */
  hasPhone: boolean;
}

/**
 * Pode ligar AGORA? A mesma condição do botão abaixo: canal de voz configurado e
 * pareado, contato com telefone e nenhuma chamada em andamento. Exportada para o
 * "Ligar" da barra da conversa no celular não aparecer quando o botão não ligaria
 * (P2 do Cassio na #180; grupo o chamador já exclui).
 */
export function usePodeLigar(hasPhone: boolean): boolean {
  const { data: sessionStatus } = useVoiceSessionStatus();
  const { call } = useVoiceCall();
  const emLigacao = !!call && call.status !== "ended";
  return !!sessionStatus?.configured && !!sessionStatus.paired && hasPhone && !emLigacao;
}

/**
 * Botão "Ligar" do Customer 360 (spec §5.1). Só aparece quando a org pareou
 * chamada de voz — feature opt-in (§1.2), nunca ligada por padrão.
 */
export function DialButton({ contactId, hasPhone }: Props) {
  const { data: sessionStatus } = useVoiceSessionStatus();
  const { call, startCall } = useVoiceCall();
  const t = useT();

  if (!sessionStatus?.configured || !sessionStatus.paired || !hasPhone) return null;

  const jaEmLigacao = !!call && call.status !== "ended";

  return (
    <Button
      variant="outline"
      className="shrink-0"
      disabled={jaEmLigacao}
      onClick={() => void startCall(contactId)}
    >
      <Phone size={16} weight="bold" aria-hidden />
      <span>{jaEmLigacao ? t("Em ligação") : t("Chamar")}</span>
    </Button>
  );
}
