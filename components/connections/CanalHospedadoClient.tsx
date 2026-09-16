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
 * Conectar o número que JÁ ESTÁ conectado em outro sistema do cliente.
 *
 * ─── Por que a tela não escreve o nome do provedor ──────────────────────────
 *
 * O rótulo vem do servidor (`label`), e não de uma string aqui: o
 * `lint:channels` proíbe nomear provider fora de `lib/channels/`, e a razão é
 * anterior ao lint — no dia em que houver um segundo canal deste tipo, esta
 * tela não muda. O que o usuário lê continua sendo a marca que ele usa.
 *
 * ─── Uma coisa só para colar ────────────────────────────────────────────────
 *
 * Os outros canais por credencial pedem DUAS: a chave, e depois a volta
 * (webhook) colada à mão no painel do outro sistema. Aqui a volta é ligada pelo
 * próprio CRM, então a tela pede um campo e pronto.
 *
 * O que ela NÃO faz é esconder quando a volta falha. `recebimento_ligado: false`
 * significa "envia mas não recebe" — o defeito mais caro deste tipo de
 * integração, porque parece sucesso. Ele ganha um cartão de aviso próprio, com
 * o motivo, em vez de um toast que some em três segundos.
 */

interface Estado {
  channel_session_id?: string | null;
  label: string;
  connected: boolean;
  instance_name: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
  has_token: boolean;
  webhook_url: string | null;
}

interface Conectado {
  instance_name: string;
  phone_number: string | null;
  display_name: string;
  status: string;
  recebimento_ligado: boolean;
  recebimento_erro: string | null;
}

export function CanalHospedadoClient() {
  const t = useT();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [recemConectado, setRecemConectado] = useState<Conectado | null>(null);

  const carregar = async () => {
    try {
      const r = await apiClient.get<{ data: Estado }>("/api/v1/channels/hosted");
      setEstado(r.data);
    } catch {
      // Falha de leitura não deve travar a tela: o formulário continua servindo.
      setEstado(null);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const conectar = async () => {
    setSalvando(true);
    try {
      const r = await apiClient.post<{ data: Conectado }>("/api/v1/channels/hosted", { token });
      setRecemConectado(r.data);
      // O token sai da memória da tela assim que é gravado: ele não volta num
      // GET, e deixá-lo no input só cria mais uma cópia de um segredo que abre
      // o WhatsApp do cliente.
      setToken("");
      if (r.data.recebimento_ligado) {
        toast.success(t("Canal conectado."));
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
            <h3 className="text-sm font-semibold">
              {t("Usar o WhatsApp que já está na")} {rotulo}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "O mesmo número que você já usa, sem ler QR de novo e sem tirar nada do ar. As conversas passam a aparecer aqui, e o que você já tinha configurado na sua plataforma continua funcionando igual.",
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
            <p className="font-medium">{estado?.display_name ?? t("Número conectado")}</p>
            <p className="text-xs text-muted-foreground">
              {estado?.phone_number ?? t("aguardando o número")} · {estado?.status ?? "—"}
            </p>
          </div>
        )}

        {estado?.channel_session_id && <ChannelAiAccess channelId={estado.channel_session_id} />}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hosted-token">{t("Token da instância")}</Label>
            <Input
              id="hosted-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                estado?.has_token ? t("gravado — preencha para trocar") : t("cole o token")
              }
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "É o token do SEU número, copiado do painel da sua plataforma. Ele vale só para essa linha — não dá acesso a nenhuma outra. Guardado cifrado, e não é mostrado de novo depois de gravado.",
              )}
            </p>
          </div>

          <div>
            <Button onClick={conectar} disabled={salvando || token.length < 8}>
              {salvando ? t("Verificando…") : conectado ? t("Reconectar") : t("Conectar")}
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t(
                "O token é testado antes de ser gravado, e é dele que vem o nome do número — você não precisa digitá-lo.",
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* O caso bom: conectou e a volta ficou de pé. Some na próxima carga da
          tela — é confirmação de uma ação, não estado permanente. */}
      {recemConectado?.recebimento_ligado && (
        <Card className="flex flex-col gap-2 p-4">
          <h3 className="text-sm font-semibold">{t("Tudo ligado")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("O CRM já avisou a")} {rotulo}{" "}
            {t(
              "para entregar as mensagens deste número aqui — você não precisa colar nada do outro lado. O que já estava configurado lá continua recebendo normalmente.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {recemConectado.display_name}
            {recemConectado.phone_number ? ` · ${recemConectado.phone_number}` : ""}
          </p>
        </Card>
      )}

      {/* O caso ruim, e o motivo de ele ser tão visível: "envia mas não recebe"
          se parece com sucesso. Sem este cartão, o operador descobriria na
          primeira resposta de cliente que não chegou — horas depois, sem nada
          apontando para a causa. */}
      {recemConectado && !recemConectado.recebimento_ligado && (
        <Card className="flex flex-col gap-2 border-warning/40 bg-warning-bg p-4">
          <h3 className="text-sm font-semibold">{t("Falta ligar a volta")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("O número foi conectado e o CRM já consegue enviar, mas")}{" "}
            <strong>{t("as respostas do cliente ainda não chegam aqui")}</strong>
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
