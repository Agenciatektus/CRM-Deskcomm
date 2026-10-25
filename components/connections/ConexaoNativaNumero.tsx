"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { copyToClipboard } from "@/lib/clipboard";
import { Copy } from "@/lib/ui/icons";

const ESPERA_S = 30;

/** Digitos do telefone BR (DDD + numero), sem o DDI 55 quando vier colado com ele. */
export function digitosBr(v: string): string {
  const d = v.replace(/\D/g, "");
  return (d.length > 11 && d.startsWith("55") ? d.slice(2) : d).slice(0, 11);
}

/** `(11) 91234-5678`. */
export function mascaraBr(v: string): string {
  const d = digitosBr(v);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const corte = d.length > 10 ? 7 : 6;
  if (d.length <= corte) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
}

export function ConexaoNativaNumero({ canalId }: { canalId: string }) {
  const t = useT();
  const id = useId();
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) return;
    const iv = setTimeout(() => setEspera((v) => v - 1), 1000);
    return () => clearTimeout(iv);
  }, [espera]);

  const gerar = async () => {
    setGerando(true);
    setErro(null);
    try {
      const r = await apiClient.post<{ data: { codigo: string } }>(
        `/api/v1/channel-sessions/${canalId}/codigo-nativo`,
        { telefone: digitosBr(telefone) },
        { timeoutMs: 30_000 },
      );
      setCodigo(r.data.codigo);
      setEspera(ESPERA_S);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setErro(
        status === 429
          ? t("Aguarde 30 segundos antes de pedir outro código.")
          : status === 400
            ? t("Confira o número, com DDD.")
            : t("Não foi possível gerar o código agora. Tente de novo em instantes."),
      );
    } finally {
      setGerando(false);
    }
  };

  const copiar = async () => {
    if (!codigo) return;
    if (await copyToClipboard(codigo)) toast.success(t("Código copiado."));
    else toast.error(t("Não foi possível copiar. Selecione e copie manualmente."));
  };

  if (codigo) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <p className="text-sm text-text-muted">{t("Seu código de conexão")}</p>
        <div className="flex items-center gap-3">
          <p className="font-mono text-4xl font-semibold tracking-[0.2em] text-text" data-testid="codigo-de-conexao">
            {codigo}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={copiar} aria-label={t("Copiar código")}>
            <Copy size={16} aria-hidden />
          </Button>
        </div>
        <ol className="list-decimal space-y-1.5 pl-5 text-left text-sm text-text">
          <li>{t("Abra o WhatsApp no celular e vá em Aparelhos conectados.")}</li>
          <li>{t("Toque em Conectar um aparelho e depois em Conectar com número de telefone.")}</li>
          <li>{t("Digite o código acima.")}</li>
        </ol>
        <Button type="button" variant="outline" size="sm" onClick={() => setCodigo(null)}>
          {t("Gerar novo código / trocar número")}
        </Button>
      </div>
    );
  }

  const valido = digitosBr(telefone).length >= 10;
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <Label htmlFor={`${id}-tel`}>{t("Número do WhatsApp")}</Label>
      <Input
        id={`${id}-tel`}
        inputMode="tel"
        autoComplete="tel-national"
        value={telefone}
        onChange={(e) => setTelefone(mascaraBr(e.target.value))}
        placeholder="(11) 91234-5678"
      />
      <p className="text-xs text-text-muted">
        {t("O número que vai ser conectado, com DDD. Você digita um código no celular, sem ler QR.")}
      </p>
      {erro && (
        <p role="alert" className="text-sm text-error-fg">
          {erro}
        </p>
      )}
      <div>
        <Button type="button" onClick={gerar} disabled={!valido || gerando || espera > 0}>
          {gerando
            ? t("Gerando…")
            : espera > 0
              ? t("Aguarde {n}s").replace("{n}", String(espera))
              : t("Gerar código de conexão")}
        </Button>
      </div>
    </div>
  );
}
