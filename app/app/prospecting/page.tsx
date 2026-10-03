import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { moduloDaEmpresa } from "@/lib/organizacao/modulos-liberados";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProspectingClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prospecção" };
export default async function ProspectingPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (org?.role !== "admin") redirect("/app/inbox");
  // Módulo que o dono do servidor libera por empresa (9026): sem liberação, a
  // tela não existe — a mesma resposta de `companies/layout.tsx`.
  if (!(await moduloDaEmpresa(createAdminClient(), org.orgId, "prospeccao"))) notFound();
  return <ProspectingClient />;
}
