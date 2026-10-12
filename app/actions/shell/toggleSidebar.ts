"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { loadAuthUser } from "@/lib/auth/server";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { cookieDoMenu, type EscopoDoMenu } from "@/lib/navigation/preferencia-do-menu";

/**
 * Fixa ou recolhe a 2ª coluna do menu, POR ATENDENTE e por escopo (Inbox ou o
 * resto do app; ver `lib/navigation/preferencia-do-menu.ts`). Sem sessão não há
 * de quem guardar, e nada é gravado.
 */
export async function toggleSidebar(currentlyCollapsed: boolean, escopo: EscopoDoMenu = "geral"): Promise<void> {
  const user = await loadAuthUser();
  if (!user) return;
  const store = await cookies();
  // Geral guarda "recolhida"; Inbox guarda "fixa" (o padrão dela é recolhida).
  const valor = escopo === "inbox" ? (currentlyCollapsed ? "1" : "0") : currentlyCollapsed ? "0" : "1";
  store.set(cookieDoMenu(escopo === "inbox" ? "inbox" : "geral", user.id), valor, {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/app", "layout");
}
