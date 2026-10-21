"use client";
/**
 * O campo de ENVIO de foto — da pessoa (Perfil) e da organização (Organização).
 *
 * Um componente para as duas telas porque o gesto é o mesmo: escolher o arquivo,
 * ver a prévia, remover. Muda só a rota e a forma (círculo para a pessoa,
 * quadrado arredondado para a empresa, igual à sigla do trilho).
 *
 * O servidor é quem decide tipo e tamanho (pelos bytes). A conferência daqui é só
 * para a pessoa não esperar um upload que vai ser recusado.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { TAMANHO_MAXIMO_DA_FOTO } from "@/lib/fotos/foto";
import { cn } from "@/lib/utils";

const ERROS: Record<string, string> = {
  unauthenticated: "Sua sessão expirou. Entre de novo para trocar a foto.",
  forbidden_role: "Você não tem permissão para trocar esta foto.",
  forbidden: "Saia do acompanhamento para trocar a foto.",
  mfa_required: "Confirme o segundo fator nesta sessão e tente de novo.",
  rate_limited: "Muitas trocas de foto seguidas. Tente em alguns minutos.",
  payload_too_large: "A foto precisa ter até 1 MB.",
  unsupported_media_type: "A foto precisa ser PNG, JPG ou WebP.",
  foto_svg_recusada: "SVG não é aceito como foto. Envie PNG, JPG ou WebP.",
};

const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"];

interface Props {
  readonly id: string;
  readonly rotulo: string;
  /** Rota que recebe POST (multipart `file`) e DELETE. */
  readonly rota: string;
  /** Campo da resposta com a URL nova (`avatar_url` ou `foto_url`). */
  readonly campoDaResposta: "avatar_url" | "foto_url";
  readonly urlInicial: string | null;
  /** O que aparece quando não há foto (iniciais ou sigla). */
  readonly substituto: string;
  readonly forma: "circulo" | "quadrado";
  readonly ajuda?: string;
}

export function CampoDeFoto({
  id,
  rotulo,
  rota,
  campoDaResposta,
  urlInicial,
  substituto,
  forma,
  ajuda,
}: Props) {
  const t = useT();
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(urlInicial);
  const [quebrou, setQuebrou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [, startTransition] = useTransition();

  async function razao(resposta: Response): Promise<string> {
    const corpo = (await resposta.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const codigo = corpo?.error?.code ?? "";
    return t(ERROS[codigo] ?? corpo?.error?.message ?? "Não consegui trocar a foto agora.");
  }

  async function aplicar(resposta: Response, removida: boolean) {
    if (!resposta.ok) {
      toast.error(await razao(resposta));
      return;
    }
    const corpo = (await resposta.json().catch(() => null)) as {
      data?: Record<string, string | null>;
    } | null;
    setUrl(corpo?.data?.[campoDaResposta] ?? null);
    setQuebrou(false);
    toast.success(removida ? t("Foto removida.") : t("Foto atualizada."));
    // O trilho, o menu e o seletor leem a foto do layout: recarregar o servidor.
    startTransition(() => router.refresh());
  }

  async function enviar(arquivo: File) {
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      toast.error(t(ERROS.unsupported_media_type!));
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_DA_FOTO) {
      toast.error(t(ERROS.payload_too_large!));
      return;
    }
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.set("file", arquivo);
      await aplicar(await fetch(rota, { method: "POST", body: corpo }), false);
    } catch {
      toast.error(t("Não consegui trocar a foto agora."));
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function remover() {
    setEnviando(true);
    try {
      await aplicar(await fetch(rota, { method: "DELETE" }), true);
    } catch {
      toast.error(t("Não consegui trocar a foto agora."));
    } finally {
      setEnviando(false);
    }
  }

  const caixa = cn(
    "grid size-16 shrink-0 place-items-center overflow-hidden bg-accent text-base font-bold text-accent-foreground",
    forma === "circulo" ? "rounded-full" : "rounded-[14px]",
  );

  return (
    <div className="space-y-2" data-campo-de-foto={id}>
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="flex flex-wrap items-center gap-4">
        <span className={caixa} aria-hidden>
          {url && !quebrou ? (
            // eslint-disable-next-line @next/next/no-img-element -- a URL é a rota que assina; next/image exige allowlist de host
            <img src={url} alt="" className="size-full object-cover" onError={() => setQuebrou(true)} />
          ) : (
            substituto
          )}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={entrada}
            id={id}
            type="file"
            accept={TIPOS_ACEITOS.join(",")}
            disabled={enviando}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void enviar(arquivo);
            }}
            className="max-w-xs text-sm file:mr-3 file:cursor-pointer file:rounded-sm file:border file:border-border file:bg-surface-elevated file:px-3 file:py-1.5 file:text-sm"
          />
          {url ? (
            <Button type="button" variant="outline" onClick={() => void remover()} disabled={enviando}>
              {t("Remover foto")}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-text-muted">{ajuda ?? t("PNG, JPG ou WebP, até 1 MB.")}</p>
    </div>
  );
}
