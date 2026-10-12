"use client";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

/** O evento que o Chrome do Android dispara quando o app pode ser instalado. */
interface EventoDeInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const CHAVE_DISPENSADO = "crm-convite-instalacao-dispensado";

function lerDispensado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DISPENSADO) === "1";
  } catch {
    return false;
  }
}

function gravarDispensado() {
  try {
    window.localStorage.setItem(CHAVE_DISPENSADO, "1");
  } catch {
    // Navegação privada ou armazenamento bloqueado: o convite volta na próxima vez.
  }
}

/** Já roda como app instalado? (Android e desktop pelo display-mode; iOS pelo `standalone`.) */
function jaInstalado(): boolean {
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const standalone =
    typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return ios || standalone;
}

/** Safari do iPhone/iPad, que não tem convite próprio: ensina o caminho manual. */
function ehSafariDoIos(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const outroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && !outroNavegador && /Safari/.test(ua);
}

/**
 * O convite DISCRETO para instalar o app, só no celular (abaixo de 760px, `mb:`).
 * Aparece uma vez por aparelho: "Agora não" grava a dispensa no `localStorage`.
 * - Android/Chrome: guarda o `beforeinstallprompt` e abre o convite do sistema.
 * - Safari do iOS: não há convite do sistema; o cartão diz onde tocar.
 * Já instalado, nunca aparece.
 */
export function ConviteDeInstalacao() {
  const t = useT();
  const [evento, setEvento] = useState<EventoDeInstalacao | null>(null);
  const [ios, setIos] = useState(false);
  const [fechado, setFechado] = useState(true);

  useEffect(() => {
    if (jaInstalado() || lerDispensado()) return;
    if (ehSafariDoIos()) {
      setIos(true);
      setFechado(false);
    }
    const aoPoderInstalar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoDeInstalacao);
      setFechado(false);
    };
    const aoInstalar = () => setFechado(true);
    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  if (fechado || (!evento && !ios)) return null;

  const dispensar = () => {
    gravarDispensado();
    setFechado(true);
  };
  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    setEvento(null);
    setFechado(true);
  };

  return (
    <aside
      aria-label={t("Convite para instalar o app")}
      className="fixed inset-x-4 bottom-[calc(16px+var(--mb-area-baixo))] z-40 hidden items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-pop mb:flex"
    >
      <div className="min-w-0 flex-1">
        <p className="text-ui font-semibold text-text">{t("Instale o app")}</p>
        <p className="text-label text-text-muted">
          {ios
            ? t("No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.")
            : t("Abra direto da tela de início, em tela cheia.")}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={dispensar}>
        {t("Agora não")}
      </Button>
      {evento && (
        <Button type="button" size="sm" onClick={() => void instalar()}>
          {t("Instalar")}
        </Button>
      )}
    </aside>
  );
}
