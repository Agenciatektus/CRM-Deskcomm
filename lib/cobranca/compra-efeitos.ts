/**
 * OS EFEITOS DA COMPRA POR LINK DE PAGAMENTO (venda direta, fatia 3c).
 *
 * `aoCriar`: a empresa já existe. Convida o pagador como administrador NA HORA
 * (via `emitirConvite`, o mesmo caminho do time) e avisa o dono da instalação.
 * Se já existe convite para (empresa, e-mail), em qualquer status, não emite
 * outro: repetir o gancho nunca reenvia o e-mail.
 * `aoDuplicar`: só avisa o dono (compra repetida, estorno manual na Stripe).
 *
 * Quem convida é o dono mais antigo da instalação (`platform_admins`, acesso
 * total): o convite exige um usuário real (auditoria e `invited_by`). Sem dono
 * ativo o gancho lança, e a compra fica `efeitos_pendentes` para a rodada.
 * O aviso ao dono sai por e-mail: a Central é por empresa, não há uma da plataforma.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { emitirConvite } from "@/lib/team/convites";

import { mascararEmail, type DependenciasDaCompra } from "./compra";
import { avisarDonosDaInstalacao } from "./emails";

const base = () => (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

const MOTIVOS: Record<string, string> = {
  mesma_sessao: "a mesma sessão de pagamento já tinha sido registrada",
  mesmo_email: "o mesmo e-mail já tem uma empresa criada nas últimas 24 horas",
  cliente_ja_vinculado: "o cliente da Stripe já está vinculado a outra empresa",
};

/** O dono mais antigo da instalação com acesso total: é quem assina o convite. */
async function atorDoConvite(admin: SupabaseClient): Promise<{ id: string; nome: string }> {
  const { data, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("scope", "full")
    .is("revoked_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`convite: donos ilegíveis (${error.code ?? "sem_codigo"})`);
  const id = ((data ?? []) as Array<{ user_id: string }>)[0]?.user_id;
  if (!id) throw new Error("convite: a instalação não tem dono ativo");
  const { data: lido, error: erroDoUsuario } = await admin.auth.admin.getUserById(id);
  if (erroDoUsuario || !lido.user) throw new Error("convite: dono ilegível");
  const meta = lido.user.user_metadata as { full_name?: unknown } | null;
  const nome = typeof meta?.full_name === "string" && meta.full_name ? meta.full_name : (lido.user.email ?? "Administrador");
  return { id, nome };
}

export function efeitosDaCompra(admin: SupabaseClient): Pick<DependenciasDaCompra, "aoCriar" | "aoDuplicar"> {
  return {
    async aoCriar(org, compra) {
      if (!compra.email) throw new Error("convite: compra sem e-mail");
      const empresa = compra.nome_empresa ?? "Nova empresa";
      const { data: existente, error: erroDaLeitura } = await admin
        .from("team_invites")
        .select("id")
        .eq("organization_id", org)
        .eq("email", compra.email.trim().toLowerCase())
        .limit(1);
      if (erroDaLeitura) throw new Error(`convite: leitura falhou (${erroDaLeitura.code ?? "sem_codigo"})`);
      if (!existente || existente.length === 0) {
        const ator = await atorDoConvite(admin);
        await emitirConvite(admin, {
          email: compra.email,
          role: "admin",
          organizationId: org,
          orgName: empresa,
          inviterId: ator.id,
          inviterName: ator.nome,
          requestId: `compra-${compra.id}`,
        });
      }

      await avisarDonosDaInstalacao(admin, {
        titulo: `Nova empresa criada por compra direta: ${empresa}`,
        corpo: `${empresa} comprou o plano ${compra.plano_chave ?? "(sem plano)"} e a empresa já está criada. O convite de administrador foi enviado ao e-mail do pagador (${mascararEmail(compra.email)}).`,
        botao: { rotulo: "Abrir a empresa", href: `${base()}/admin/tenants/${org}` },
      });
    },

    async aoDuplicar(compra, motivo) {
      await avisarDonosDaInstalacao(admin, {
        titulo: "Compra repetida: conferir e estornar na Stripe",
        corpo: `Chegou uma compra repetida de ${mascararEmail(compra.email)} (${MOTIVOS[motivo] ?? motivo}). Nenhuma empresa nem convite foi criado. Confira o pagamento na Stripe e estorne a cobrança. Compra: ${compra.id}.`,
        botao: null,
      });
    },
  };
}
