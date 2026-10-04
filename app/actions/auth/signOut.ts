"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { marcarLimpezaDeCache } from "@/lib/auth/limpar-cache-no-logout";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hdrs = await headers();
  await supabase.auth.signOut();

  // Clear active_org cookie too.
  const store = await cookies();
  store.delete("active_org");
  // O cache HTTP de quem saiu (o 302 da mídia é `private, max-age`) é limpo na
  // próxima resposta do proxy: `Clear-Site-Data: "cache"`.
  marcarLimpezaDeCache(store, cookieSecure());

  if (user) {
    await audit({
      action: "auth.logout",
      actorUserId: user.id,
      requestId: hdrs.get("x-request-id"),
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent") ?? null,
    });
  }

  redirect("/login");
}
