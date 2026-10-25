"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { assinarPasskey, detectarExtensao, PASSKEY_EXTENSAO_URL } from "@/lib/passkey-bridge";
import { ArrowsClockwise, CheckCircle, CircleNotch, Key, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import type { CorpoConexao } from "./useConexaoNativa";

type Fase = "parado" | "assinando" | "aguardando" | "erro";

/** Bolinha numerada do cartao: vira check quando o passo esta feito. */
function Bolinha({ n, feito }: { n: number; feito: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        feito ? "border-success-fg/40 bg-success-bg text-success-fg" : "border-border bg-surface-elevated text-text-muted",
      )}
    >
      {feito ? <CheckCircle size={16} weight="fill" aria-hidden /> : n}
    </span>
  );
}

/**
 * Passkey: para contas em que o WhatsApp exige chave de acesso ao vincular. A
 * extensao de passkey assina o desafio na aba do WhatsApp Web; a assertion segue
 * para o CRM, que a entrega ao servidor de WhatsApp. O desafio vem do poll
 * compartilhado do assistente (`corpo.passkey`); aqui so se assina UMA vez por
 * desafio (o mesmo desafio ainda pode aparecer no poll seguinte).
 */
export function ConexaoNativaPasskey({ canalId, corpo }: { canalId: string; corpo: CorpoConexao | null }) {
  const t = useT();
  const [instalada, setInstalada] = useState<boolean | null>(null);
  const [checando, setChecando] = useState(false);
  const [ativo, setAtivo] = useState(false);
  const [fase, setFase] = useState<Fase>("parado");
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const assinado = useRef<string | null>(null);
  const desafio = corpo?.passkey;
  const chave = desafio?.challenge;

  const verificar = useCallback(async () => {
    setChecando(true);
    setInstalada(await detectarExtensao());
    setChecando(false);
  }, []);
  useEffect(() => {
    // Chamada dentro de uma funcao async: o setState nao roda sincrono no efeito.
    void verificar();
  }, [verificar]);

  useEffect(() => {
    if (!ativo || !desafio || assinado.current === chave) return;
    assinado.current = chave ?? null;
    let cancelado = false;
    const rodar = async () => {
      setFase("assinando");
      const r = await assinarPasskey(desafio);
      if (cancelado) return;
      if (!r.ok || !r.assertion) {
        assinado.current = null;
        setErro(r.cancelled ? t("Assinatura cancelada. Tente de novo.") : t("Não foi possível assinar a chave de acesso. Confira a extensão e tente de novo."));
        setFase("erro");
        return;
      }
      try {
        await apiClient.post(`/api/v1/channel-sessions/${canalId}/passkey-nativo`, r.assertion, { timeoutMs: 20_000 });
        setErro(null);
        setFase("aguardando");
      } catch {
        assinado.current = null;
        setErro(t("O WhatsApp não aceitou a chave de acesso. Tente de novo."));
        setFase("erro");
      }
    };
    void rodar();
    return () => {
      cancelado = true;
    };
    // `desafio` muda de identidade a cada poll; o que identifica o desafio e a chave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, chave, tentativa, canalId]);

  const iniciar = () => {
    setErro(null);
    setFase("parado");
    assinado.current = null;
    setAtivo(true);
    setTentativa((v) => v + 1);
  };
  const erroDoServidor = corpo?.estado === "erro" ? corpo.mensagem : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex gap-2.5 rounded-lg border border-border bg-surface-elevated px-3 py-2.5">
        <Key size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
        <p className="text-xs leading-relaxed text-text-muted">
          {t("Use este método se, ao conectar, o WhatsApp pedir uma chave de acesso (passkey) ou \"continuar no WhatsApp Web\". É uma exigência nova de segurança da Meta.")}
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-border p-3.5">
        <Bolinha n={1} feito={instalada === true} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">{t("Instale a extensão")}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {t("Ela assina a chave de acesso com segurança direto no WhatsApp Web. Não guarda senha nem token.")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!instalada && (
              <Button asChild size="sm" variant="outline">
                <a href={PASSKEY_EXTENSAO_URL} target="_blank" rel="noopener noreferrer">
                  {t("Instalar extensão")}
                </a>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => void verificar()} disabled={checando}>
              {checando ? <CircleNotch size={14} className="animate-spin" aria-hidden /> : <ArrowsClockwise size={14} aria-hidden />}
              {instalada ? t("Instalada ✓") : t("Já instalei, verificar")}
            </Button>
          </div>
        </div>
      </div>

      <div className={cn("flex items-start gap-2.5 rounded-lg border border-border p-3.5", !instalada && "opacity-60")}>
        <Bolinha n={2} feito={false} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">{t("Entre no WhatsApp Web e conecte")}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {t("Abra o WhatsApp Web, faça login pelo celular e volte aqui. Ao aparecer o pedido de chave de acesso, a extensão assina automaticamente.")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <a href="https://web.whatsapp.com/" target="_blank" rel="noopener noreferrer">
                {t("Abrir WhatsApp Web")}
              </a>
            </Button>
            <Button size="sm" onClick={iniciar} disabled={!instalada || (ativo && fase !== "erro")}>
              {ativo && fase !== "erro" ? t("Conectando…") : t("Conectar com passkey")}
            </Button>
          </div>
        </div>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {ativo && fase === "assinando" && (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <CircleNotch size={14} className="animate-spin" aria-hidden /> {t("Assinando a chave de acesso…")}
          </p>
        )}
        {ativo && (fase === "aguardando" || (fase === "parado" && !desafio)) && !erro && (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <CircleNotch size={14} className="animate-spin" aria-hidden />{" "}
            {t("Aguardando o WhatsApp concluir o pareamento… (confirme o código no celular, se pedir)")}
          </p>
        )}
        {(erro || erroDoServidor) && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-error-fg/30 bg-error-bg px-3 py-2.5 text-error-fg">
            <Warning size={16} className="mt-0.5 shrink-0" aria-hidden />
            <p className="text-xs leading-relaxed">{erro ?? t("Não foi possível ler o pedido de chave de acesso do WhatsApp. Tente de novo.")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
