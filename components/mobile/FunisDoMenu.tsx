"use client";
import { createContext, useContext, type ReactNode } from "react";

import type { FunilDoMenu } from "@/lib/navigation/funis-no-menu";

/**
 * Os funis da organização, lidos pelo layout no SERVIDOR (o mesmo dado do nó de funis
 * do menu: a rota que os lista exige `manager`, e o menu é visto por todo papel). A
 * casca os entrega aqui para o seletor de funil do celular (M3.1) não pedir de novo.
 */
const Contexto = createContext<readonly FunilDoMenu[]>([]);

export function FunisDoMenuProvider({ funis, children }: { funis: readonly FunilDoMenu[]; children: ReactNode }) {
  return <Contexto.Provider value={funis}>{children}</Contexto.Provider>;
}

export function useFunisDoMenu(): readonly FunilDoMenu[] {
  return useContext(Contexto);
}
