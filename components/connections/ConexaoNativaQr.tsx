"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CLASSES_DA_OPCAO_DO_SEGMENTO, CLASSES_DO_SEGMENTO } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { ArrowsClockwise, ArrowsOutSimple, CircleNotch, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import type { CorpoConexao } from "./useConexaoNativa";

/** O QR do WhatsApp gira em ~20 s; o poll troca a imagem sozinho. */
const VIDA_DO_QR_S = 20;

type Aparelho = "android" | "iphone";

function Contagem({ qr }: { qr: string }) {
  const t = useT();
  return <ContagemDoQr key={qr} t={t} />;
}

/** Remontada a cada QR novo (key): o relogio recomeca sem setState em efeito. */
function ContagemDoQr({ t }: { t: (v: string) => string }) {
  const [decorrido, setDecorrido] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setDecorrido((v) => v + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const restante = Math.max(0, VIDA_DO_QR_S - decorrido);
  return (
    <p className="text-center text-xs text-text-muted">
      {restante > 0 ? t("Novo QR em {n}s").replace("{n}", String(restante)) : t("Atualizando o QR…")}
    </p>
  );
}

function Instrucoes() {
  const t = useT();
  const [aparelho, setAparelho] = useState<Aparelho>("android");
  const menu =
    aparelho === "android"
      ? t("Toque no menu ⋮, no canto superior direito.")
      : t("Toque em Configurações (a engrenagem), no canto inferior direito.");
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t("Tipo de celular")} className={cn(CLASSES_DO_SEGMENTO, "w-fit")}>
        {(["android", "iphone"] as const).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={aparelho === a}
            data-ativa={aparelho === a}
            className={CLASSES_DA_OPCAO_DO_SEGMENTO}
            onClick={() => setAparelho(a)}
          >
            {a === "android" ? "Android" : "iPhone"}
          </button>
        ))}
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text">
        <li>{t("Abra o WhatsApp no celular.")}</li>
        <li>{menu}</li>
        <li>{t("Toque em Aparelhos conectados.")}</li>
        <li>{t("Toque em Conectar um aparelho.")}</li>
        <li>{t("Aponte a câmera do celular para o QR code desta tela.")}</li>
      </ol>
    </div>
  );
}

function Ampliado({ qr, onFechar }: { qr: string; onFechar: () => void }) {
  const t = useT();
  const [brilho, setBrilho] = useState(100);
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("QR code ampliado")}</DialogTitle>
          <DialogDescription>{t("Aumente o brilho da tela se o celular não conseguir ler.")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={t("QR Code para conectar WhatsApp")}
            style={{ filter: `brightness(${brilho}%)` }}
            className="aspect-square w-full max-w-md rounded-xl bg-white p-4"
          />
          <label className="flex w-full max-w-md items-center gap-3 text-sm text-text-muted">
            {t("Brilho")}
            <input
              type="range"
              min={30}
              max={100}
              value={brilho}
              onChange={(e) => setBrilho(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-10 text-right font-mono">{brilho}%</span>
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConexaoNativaQr({
  corpo,
  falha,
  onTentarAgora,
}: {
  corpo: CorpoConexao | null;
  falha: boolean;
  onTentarAgora: () => void;
}) {
  const t = useT();
  const [ampliar, setAmpliar] = useState(false);
  const erro = falha || corpo?.estado === "erro";
  const qr = !erro && corpo?.estado === "aguardando_leitura" ? corpo.qr : undefined;
  const reconectando = !erro && corpo?.estado === "reconectando";

  return (
    <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
      <div className="flex flex-col items-center gap-2">
        <div className="flex aspect-square w-full max-w-72 items-center justify-center rounded-xl bg-white p-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={t("QR Code para conectar WhatsApp")} className="h-full w-full" />
          ) : erro ? (
            <div className="flex flex-col items-center gap-3 p-4 text-center text-sm text-error-fg">
              <Warning size={28} aria-hidden />
              <p>{t("Não foi possível gerar o QR agora.")}</p>
              <Button size="sm" variant="outline" onClick={onTentarAgora}>
                {t("Tentar agora")}
              </Button>
            </div>
          ) : (
            <Skeleton className="h-full w-full rounded-lg" />
          )}
        </div>
        {qr ? (
          <>
            <Contagem qr={qr} />
            <Button size="sm" variant="outline" onClick={() => setAmpliar(true)}>
              <ArrowsOutSimple size={16} aria-hidden /> {t("Ampliar")}
            </Button>
          </>
        ) : (
          !erro && (
            <p className="flex items-center gap-2 text-sm text-text-muted">
              {reconectando ? <ArrowsClockwise size={16} className="animate-spin" aria-hidden /> : <CircleNotch size={16} className="animate-spin" aria-hidden />}
              {reconectando ? t("O QR expirou, gerando um novo…") : t("Gerando o QR code…")}
            </p>
          )
        )}
      </div>
      <Instrucoes />
      {ampliar && qr && <Ampliado qr={qr} onFechar={() => setAmpliar(false)} />}
    </div>
  );
}
