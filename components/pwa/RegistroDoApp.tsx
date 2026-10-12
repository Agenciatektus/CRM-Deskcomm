"use client";
import { useEffect } from "react";

import { ensureNotifyServiceWorker } from "@/lib/notifications/service_worker";

/**
 * Registra o service worker do app em toda página (login inclusive), para o app
 * instalado abrir a tela "sem conexão" quando a rede cair. É o MESMO script da
 * bandeja e do Web Push (`public/notify-sw.js`): registrar de novo um script já
 * registrado não troca nada, e as notificações de quem já as ativou continuam.
 */
export function RegistroDoApp() {
  useEffect(() => {
    void ensureNotifyServiceWorker();
  }, []);
  return null;
}
