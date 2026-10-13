"use client";

import { criarPreferenciaCompacta } from "@/hooks/ui/useListaCompacta";

/**
 * A DENSIDADE do card do funil (confortável × compacto), lembrada por pessoa
 * neste navegador. Mesma mecânica da lista compacta da Inbox, chave própria.
 */
export const CHAVE_DO_FUNIL_COMPACTO = "funil_compacto";

export const useFunilCompacto = criarPreferenciaCompacta(CHAVE_DO_FUNIL_COMPACTO);
