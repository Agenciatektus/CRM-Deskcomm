/**
 * O designer de automações mudou para `/app/automacoes/[id]` quando as
 * automações ganharam porta própria no menu do CRM. Esta rota fica só para o
 * link salvo, o favorito e o e-mail antigo continuarem abrindo a mesma regra.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DesignerAntigo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/automacoes/${encodeURIComponent(id)}`);
}
