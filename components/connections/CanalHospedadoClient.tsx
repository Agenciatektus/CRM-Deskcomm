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

/** Um número conectado. A organização pode ter vários (vendas, pós-venda, filial). */
interface NumeroConectado {
  channel_session_id: string;
  instance_name: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
  has_token: boolean;
}

interface Estado {
  channel_session_id?: string | null;
  /** Ausente em servidor anterior a esta versão — aí vale o número solto abaixo. */
  sessions?: NumeroConectado[];
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
  const [codigo, setCodigo] = useState("");
  const [token, setToken] = useState("");
  // O caminho do token fica FECHADO por padrão. Ele funciona e continua aqui
  // para quem já o usa, mas é o caminho que deixa a credencial da linha morar
  // dentro do CRM — e um campo aberto na tela é um convite a usá-lo.
  const [mostrarAvancado, setMostrarAvancado] = useState(false);
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

  const conectar = async (via: "codigo" | "token") => {
    setSalvando(true);
    try {
      const corpo = via === "codigo" ? { codigo } : { token };
      const r = await apiClient.post<{ data: Conectado }>("/api/v1/channels/hosted", corpo);
      setRecemConectado(r.data);
      // O que foi digitado sai da memória da tela assim que é gravado: nada
      // disso volta num GET, e deixar no input só cria mais uma cópia de um
      // segredo que abre o WhatsApp do cliente.
      setCodigo("");
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
  const numeros: NumeroConectado[] =
    estado?.sessions ??
    (conectado && estado?.channel_session_id
      ? [
          {
            channel_session_id: estado.channel_session_id,
            instance_name: estado.instance_name,
            phone_number: estado.phone_number,
            display_name: estado.display_name,
            status: estado.status,
            has_token: estado.has_token,
          },
        ]
      : []);

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

        {numeros.map((n) => (
          <div key={n.channel_session_id} className="flex flex-col gap-3">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{n.display_name ?? t("Número conectado")}</p>
              <p className="text-xs text-muted-foreground">
                {n.phone_number ?? t("aguardando o número")} · {n.status ?? "—"}
              </p>
            </div>
            <ChannelAiAccess channelId={n.channel_session_id} />
          </div>
        ))}

        {numeros.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t(
              "Pode conectar mais de um número. O CRM reconhece cada número pelo código: se for um que já está aqui, ele é reconectado; se for outro, vira um canal novo.",
            )}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hosted-codigo">{t("Código de conexão")}</Label>
            <Input
              id="hosted-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="XK4P9T2MQW"
              autoComplete="off"
              className="font-mono tracking-[0.15em]"
            />
            <p className="text-xs text-muted-foreground">
              {t("Na")} {rotulo}, {t("abra")} <strong>{t("Integrações › Conectar ao CRM")}</strong>
              {t(", escolha o número e gere o código. Ele vale uma vez e expira em 15 minutos.")}
            </p>
          </div>

          <div>
            <Button onClick={() => conectar("codigo")} disabled={salvando || codigo.length < 8}>
              {salvando
                ? t("Conectando…")
                : numeros.length > 0
                  ? t("Conectar outro número ou reconectar")
                  : t("Conectar")}
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t(
                "Você não precisa copiar senha nem token: o acesso fica registrado na sua plataforma, e você pode cortá-lo por lá quando quiser.",
              )}
            </p>
          </div>

          {/* O caminho antigo, fechado por padrão e com o custo declarado. Ele
              continua aqui porque há número conectado por ele — tirar agora
              deixaria quem já usa sem caminho de reconexão. */}
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setMostrarAvancado((v) => !v)}
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              {mostrarAvancado ? t("Esconder") : t("Não tenho código — usar o token do número")}
            </button>

            {mostrarAvancado && (
              <div className="mt-3 flex flex-col gap-1.5">
                <Label htmlFor="hosted-token">{t("Token da instância")}</Label>
                <Input
                  id="hosted-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t("cole o token")}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Funciona, mas guarda aqui a chave do seu número: para cortar o acesso depois é preciso trocar essa chave na sua plataforma, o que derruba junto o que já usa aquele número. Prefira o código.",
                  )}
                </p>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => conectar("token")}
                    disabled={salvando || token.length < 8}
                  >
                    {salvando ? t("Verificando…") : t("Conectar com o token")}
                  </Button>
                </div>
              </div>
            )}
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
