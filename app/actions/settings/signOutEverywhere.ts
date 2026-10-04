"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { cookies, headers } from "next/headers";
import { marcarLimpezaDeCache } from "@/lib/auth/limpar-cache-no-logout";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

export async function signOutEverywhere(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");

  await supabase.auth.signOut({ scope: "global" });
  // Mesmo cuidado do logout comum: o cache HTTP deste navegador é limpo na
  // próxima resposta do proxy (ver `lib/auth/limpar-cache-no-logout.ts`).
  marcarLimpezaDeCache(await cookies(), cookieSecure());

  if (user) {
    await audit({
      action: "auth.logout",
      actorUserId: user.id,
      requestId,
      metadata: { scope: "global" },
    });
  }
  redirect("/login");
}
