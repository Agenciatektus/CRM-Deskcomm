"use client";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { mensagemDoMotivo } from "@/lib/channels/instagram/direto-mensagens";
import { useT } from "@/hooks/i18n/useT";

/**
 * A página onde o "Conectar com o Instagram" termina.
 *
 * A plataforma devolve o navegador a `?pedido=&status=&motivo=` e, no sucesso, a `conclusao` no
 * FRAGMENTO (`#conclusao=`). O fragmento é lido só aqui, em JavaScript, e LIMPO da barra de
 * endereços antes de qualquer outra coisa (`history.replaceState`): não fica no histórico, não
 * vai em Referer. Ele vive numa variável local do efeito e viaja uma vez, no corpo do POST;
 * nunca entra em estado do React. O `nonce` nem passa por aqui: está no cookie do servidor.
 *
 * Quem conclui é o servidor, que só aceita se a sessão e o `pedido` forem os do cookie.
 */

type Fase =
  | { tipo: "concluindo" }
  | { tipo: "sucesso"; nome: string; recebimentoLigado: boolean }
  | { tipo: "erro"; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function InstagramRetornoClient() {
  const t = useT();
  const [fase, setFase] = useState<Fase>({ tipo: "concluindo" });
  // O modo estrito monta o efeito duas vezes em desenvolvimento, e o fragmento só existe na
  // primeira: sem a trava a segunda leitura veria "sem conclusão" e mostraria erro.
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;

    const conclusao = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("conclusao");
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    const query = new URLSearchParams(window.location.search);
    const pedido = query.get("pedido") ?? "";
    const falhou = (mensagem: string) => setFase({ tipo: "erro", mensagem });

    if (query.get("status") !== "ok") {
      falhou(mensagemDoMotivo(query.get("motivo"), t));
      return;
    }
    if (!UUID.test(pedido) || !conclusao) {
      falhou(mensagemDoMotivo(null, t));
      return;
    }

    apiClient
      .post<{ data: { display_name: string; recebimento_ligado: boolean } }>(
        "/api/v1/channels/instagram/concluir",
        { pedido_id: pedido, conclusao },
      )
      .then((r) =>
        setFase({
          tipo: "sucesso",
          nome: r.data.display_name,
          recebimentoLigado: r.data.recebimento_ligado,
        }),
      )
      // A mensagem do servidor já vem traduzida e sem dado sensível.
      .catch((e: unknown) => falhou(e instanceof Error ? e.message : mensagemDoMotivo(null, t)));
    // Roda uma vez: depender de `t` repetiria a conclusão, e o pedido vale uma só.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="flex flex-col gap-3 p-4" role="status" aria-live="polite">
      {fase.tipo === "concluindo" && (
        <>
          <h3 className="text-sm font-semibold">{t("Concluindo a conexão…")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("Estamos ligando a conta do Instagram ao atendimento. Leva poucos segundos.")}
          </p>
        </>
      )}
      {fase.tipo === "sucesso" && (
        <>
          <h3 className="text-sm font-semibold">{t("Instagram conectado.")}</h3>
          <p className="text-sm">{fase.nome}</p>
          <p className="text-xs text-muted-foreground">
            {fase.recebimentoLigado
              ? t("O Direct desta conta já vem para o atendimento. Você não precisa configurar nada do outro lado.")
              : t("A conta foi conectada, mas as mensagens do Direct ainda não chegam aqui. Tente reconectar.")}
          </p>
        </>
      )}
      {fase.tipo === "erro" && (
        <>
          <h3 className="text-sm font-semibold">{t("Não foi possível conectar o Instagram")}</h3>
          <p className="text-xs text-muted-foreground">{fase.mensagem}</p>
        </>
      )}
      {fase.tipo !== "concluindo" && (
        <div>
          <Button asChild variant={fase.tipo === "erro" ? "default" : "outline"}>
            <a href="/app/connections?aba=instagram">
              {fase.tipo === "erro" ? t("Tentar de novo") : t("Ir para as conexões")}
            </a>
          </Button>
        </div>
      )}
    </Card>
  );
}
