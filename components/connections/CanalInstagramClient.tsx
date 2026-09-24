"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { ChannelAiAccess } from "./ChannelAiAccess";

/**
 * Conectar a conta de Instagram que já está ligada na plataforma do cliente.
 *
 * ─── Um campo, e por que não há o caminho alternativo do WhatsApp ───────────
 *
 * A tela do canal hospedado de WhatsApp tem um segundo caminho, fechado por
 * padrão: colar o token da própria linha. Aqui ele não existe, e a ausência é
 * decisão, não esquecimento. A credencial do Instagram é um token OAuth com
 * validade curta e renovação própria; um campo para colá-lo entregaria uma
 * conexão que apaga sozinha em semanas — e a tela não teria como explicar por
 * quê, porque quem renova é o outro lado.
 *
 * ─── "Instagram" aqui, o transporte não ─────────────────────────────────────
 *
 * O rótulo da PLATAFORMA vem do servidor (`label`), como manda a doutrina. Mas
 * a palavra "Instagram" no título é do produto, não do provedor: quem atende
 * precisa ler o nome da rede que está ligando. Trocar quem entrega não muda
 * esta tela.
 *
 * ─── O defeito que esta tela se recusa a esconder ───────────────────────────
 *
 * `recebimento_ligado: false` significa "conectou mas não recebe" — o modo de
 * falha mais caro desse tipo de integração, porque se parece com sucesso. Ele
 * ganha um cartão próprio com o motivo, e não um toast que some em três
 * segundos.
 */

interface Estado {
  channel_session_id?: string | null;
  label: string;
  connected: boolean;
  display_name: string | null;
  status: string | null;
  has_token: boolean;
  webhook_url: string | null;
}

interface Conectado {
  display_name: string;
  status: string;
  recebimento_ligado: boolean;
  recebimento_erro: string | null;
}

export function CanalInstagramClient() {
  const t = useT();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [codigo, setCodigo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [recemConectado, setRecemConectado] = useState<Conectado | null>(null);

  const carregar = async () => {
    try {
      const r = await apiClient.get<{ data: Estado }>("/api/v1/channels/instagram");
      setEstado(r.data);
    } catch {
      // Falha de leitura não trava a tela: o formulário continua servindo.
      setEstado(null);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const conectar = async () => {
    setSalvando(true);
    try {
      const r = await apiClient.post<{ data: Conectado }>("/api/v1/channels/instagram", { codigo });
      setRecemConectado(r.data);
      // O código sai da memória da tela assim que é usado: ele vale uma vez só,
      // e deixá-lo no input só convida a tentar de novo com um código queimado.
      setCodigo("");
      if (r.data.recebimento_ligado) {
        toast.success(t("Instagram conectado."));
      } else {
        toast.warning(t("Conectado, mas o recebimento não foi ligado."));
      }
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? t(e.message) : t("Não foi possível conectar."));
    } finally {
      setSalvando(false);
    }
  };

  const rotulo = estado?.label ?? t("sua plataforma");
  const conectado = estado?.connected ?? false;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t("Receber o Direct do Instagram aqui")}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "As mensagens que chegam no Direct do seu perfil passam a aparecer no atendimento, junto do WhatsApp. Quem já responde pelo aplicativo continua podendo responder por lá.",
              )}
            </p>
          </div>
          {conectado ? (
            <Badge variant="secondary">{t("Conectado")}</Badge>
          ) : (
            <Badge variant="outline">{t("Não conectado")}</Badge>
          )}
        </div>

        {conectado && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{estado?.display_name ?? t("Conta conectada")}</p>
            <p className="text-xs text-muted-foreground">{estado?.status ?? "—"}</p>
          </div>
        )}

        {estado?.channel_session_id && (
          <ChannelAiAccess channelId={estado.channel_session_id} phoneTesting={false} />
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="instagram-codigo">{t("Código de conexão")}</Label>
            <Input
              id="instagram-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="XK4P9T2MQW"
              autoComplete="off"
              className="font-mono tracking-[0.15em]"
            />
            <p className="text-xs text-muted-foreground">
              {t("Na")} {rotulo}, {t("abra")} <strong>{t("Integrações › Conectar ao CRM")}</strong>
              {t(
                ", escolha a conta de Instagram e gere o código. Ele vale uma vez e expira em 15 minutos.",
              )}
            </p>
          </div>

          <div>
            <Button onClick={() => void conectar()} disabled={salvando || codigo.length < 8}>
              {salvando ? t("Conectando…") : conectado ? t("Reconectar") : t("Conectar")}
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t(
                "Você não cola senha nem token: o acesso fica registrado na sua plataforma, e você pode cortá-lo por lá quando quiser.",
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* Conectou e a volta ficou de pé. Some na próxima carga — é confirmação
          de uma ação, não estado permanente. */}
      {recemConectado?.recebimento_ligado && (
        <Card className="flex flex-col gap-2 p-4">
          <h3 className="text-sm font-semibold">{t("Tudo ligado")}</h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "O Direct desta conta já vem para o atendimento. Você não precisa configurar nada do outro lado.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">{recemConectado.display_name}</p>
        </Card>
      )}

      {/* O caso ruim, e o motivo de ele ser tão visível: "conectou mas não
          recebe" se parece com sucesso. Sem este cartão, quem atende só
          descobriria na primeira mensagem de cliente que nunca chegou. */}
      {recemConectado && !recemConectado.recebimento_ligado && (
        <Card className="flex flex-col gap-2 border-warning/40 bg-warning-bg p-4">
          <h3 className="text-sm font-semibold">{t("Falta ligar a volta")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("A conta foi conectada, mas")}{" "}
            <strong>{t("as mensagens do Direct ainda não chegam aqui")}</strong>
            {t(". Tente reconectar; se continuar, o motivo relatado foi:")}
          </p>
          <code className="overflow-x-auto rounded-md bg-muted px-2 py-1.5 text-xs">
            {recemConectado.recebimento_erro ?? t("sem detalhe")}
          </code>
        </Card>
      )}
    </div>
  );
}
