"use client";
import type { ReactNode } from "react";

import { AvisosNoCelular } from "@/components/mobile/telas/Avisos";
import { useEhCelular } from "@/lib/mobile/useEhCelular";

/**
 * Abaixo de 760px a central vira a aba Avisos do celular (M3.3); do desktop para
 * cima, a página de sempre (`children`, montada pelo servidor).
 */
export function TelaDosAvisos({ children }: { children: ReactNode }) {
  return useEhCelular() ? <AvisosNoCelular /> : <>{children}</>;
}
