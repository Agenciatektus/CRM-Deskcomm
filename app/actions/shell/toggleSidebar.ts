"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { loadAuthUser } from "@/lib/auth/server";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import {
  COOKIE_DO_MENU,
  COOKIE_LEGADO_DO_MENU,
  escreverPreferenciaDoMenu,
  lerPreferenciaDoMenu,
  type EscopoDoMenu,
} from "@/lib/navigation/preferencia-do-menu";

/**
 * Fixa ou recolhe a 2ª coluna do menu, para o atendente da sessão e por escopo
 * (Inbox ou o resto do app; ver `lib/navigation/preferencia-do-menu.ts`). Um
 * cookie só por navegador, sobrescrito por quem mexer. Sem sessão não há de
 * quem guardar, e nada é gravado.
 */
export async function toggleSidebar(currentlyCollapsed: boolean, escopo: EscopoDoMenu = "geral"): Promise<void> {
  const user = await loadAuthUser();
  if (!user) return;
  const store = await cookies();
  const atual = lerPreferenciaDoMenu(store.get(COOKIE_DO_MENU)?.value, user.id) ?? {
    recolhidoGeral: store.get(COOKIE_LEGADO_DO_MENU)?.value === "1",
    fixoNaInbox: false,
  };
  const nova =
    escopo === "inbox"
      ? { ...atual, fixoNaInbox: currentlyCollapsed }
      : { ...atual, recolhidoGeral: !currentlyCollapsed };
  store.set(COOKIE_DO_MENU, escreverPreferenciaDoMenu(user.id, nova), {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/app", "layout");
}
