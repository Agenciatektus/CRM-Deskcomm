"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { randomId } from "@/lib/random-id";

import { ConexaoNativaDialog } from "./ConexaoNativaDialog";

/**
 * "Conectar por QR code": o CRM cria a conexão e mostra o QR no mesmo modal do
 * número por QR. Só aparece quando a organização tem o recurso habilitado (o
 * servidor devolve um booleano; nada de pasta ou token chega aqui).
 *
 * A chave de idempotência vive até a criação dar certo: um segundo clique, ou
 * uma nova tentativa depois de queda de rede, devolve o MESMO canal em vez de
 * criar outra conexão.
 */
export function ConectarPorQr({ onAtualizar }: { onAtualizar: () => void }) {
  const t = useT();
  const [rotulo, setRotulo] = useState("");
  const [criando, setCriando] = useState(false);
  const [canalId, setCanalId] = useState<string | null>(null);
  const chave = useRef<string | null>(null);

  const criar = async () => {
    setCriando(true);
    try {
      const r = await apiClient.post<{
        data: { channel_session_id: string; recebimento_ligado: boolean };
      }>(
        "/api/v1/channels/hosted",
        { modo: "qr", rotulo },
        { idempotencyKey: (chave.current ??= randomId()), timeoutMs: 120_000 },
      );
      chave.current = null;
      setRotulo("");
      setCanalId(r.data.channel_session_id);
      if (!r.data.recebimento_ligado) {
        toast.warning(t("Conexão criada, mas o recebimento não foi ligado."));
      }
      onAtualizar();
    } catch (e) {
      toast.error(e instanceof Error ? t(e.message) : t("Não foi possível criar a conexão."));
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <Label htmlFor="hosted-rotulo">{t("Nome da conexão")}</Label>
      <Input
        id="hosted-rotulo"
        value={rotulo}
        onChange={(e) => setRotulo(e.target.value)}
        placeholder={t("Nome do número, por exemplo Comercial")}
        maxLength={60}
        autoComplete="off"
      />
      <p className="text-xs text-muted-foreground">
        {t("Um nome para reconhecer este número na lista (por exemplo, Comercial). Depois você conecta lendo um QR code ou digitando um código no celular.")}
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={criar} disabled={criando || rotulo.trim().length < 1}>
          {criando ? t("Criando…") : t("Conectar WhatsApp")}
        </Button>
      </div>
      {canalId && (
        <ConexaoNativaDialog
          canalId={canalId}
          onClose={() => {
            setCanalId(null);
            onAtualizar();
          }}
          onConectado={() => {
            toast.success(t("Canal conectado."));
            onAtualizar();
          }}
        />
      )}
    </div>
  );
}
