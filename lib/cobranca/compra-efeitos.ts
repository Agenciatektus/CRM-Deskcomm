/**
 * OS EFEITOS DA COMPRA POR LINK DE PAGAMENTO (venda direta, fatia 3c).
 *
 * `aoCriar`: a empresa já existe. Convida o pagador como administrador NA HORA
 * (via `emitirConvite`, o mesmo caminho do time) e avisa o dono da instalação.
 * Se já existe convite para (empresa, e-mail), em qualquer status, não emite
 * outro: repetir o gancho nunca reenvia o e-mail.
 * `aoDuplicar`: avisa o dono (compra repetida, estorno manual na Stripe), salvo na
 * `mesma_sessao`, que é a mesma cobrança chegando de novo: só log.
 * O convite é travado de forma atômica (`motivo = convite_em_curso`) antes de emitir.
 *
 * Quem convida é o dono mais antigo da instalação (`platform_admins`, acesso
 * total): o convite exige um usuário real (auditoria e `invited_by`). Sem dono
 * ativo o gancho lança, e a compra fica `efeitos_pendentes` para a rodada.
 * O aviso ao dono sai por e-mail: a Central é por empresa, não há uma da plataforma.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { marcaDaSaida } from "@/lib/branding/saida";
import { env } from "@/lib/env";
import { emitirConvite } from "@/lib/team/convites";

import {
  MOTIVO_DO_CONVITE_EM_CURSO,
  MOTIVO_DOS_EFEITOS_PENDENTES,
  limiteDoConviteEmCurso,
  mascararEmail,
  type DependenciasDaCompra,
} from "./compra";
import { avisarDonosDaInstalacao } from "./emails";

const base = () => (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

const MOTIVOS: Record<string, string> = {
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
  // O nome no convite é o da instalação: o e-mail do dono nunca vai para o convidado.
  let nome = "Equipe da plataforma";
  try {
    nome = (await marcaDaSaida(null)).nome || nome;
  } catch {
    /* mantém o literal neutro */
  }
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
      const { data: travada, error: erroDaTrava } = await admin
        .from("cobranca_compras")
        .update({ motivo: MOTIVO_DO_CONVITE_EM_CURSO })
        .eq("id", compra.id)
        .or(`motivo.is.null,motivo.eq.${MOTIVO_DOS_EFEITOS_PENDENTES},and(motivo.eq.${MOTIVO_DO_CONVITE_EM_CURSO},updated_at.lt.${limiteDoConviteEmCurso()})`)
        .select("id");
      if (erroDaTrava) throw new Error(`convite: trava falhou (${erroDaTrava.code ?? "sem_codigo"})`);
      if (!travada || travada.length === 0) return; // outro processo já está convidando

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

      const { error: erroDaLimpeza } = await admin
        .from("cobranca_compras")
        .update({ motivo: null })
        .eq("id", compra.id)
        .eq("motivo", MOTIVO_DO_CONVITE_EM_CURSO);
      if (erroDaLimpeza) throw new Error(`convite: limpeza falhou (${erroDaLimpeza.code ?? "sem_codigo"})`);
    },

    async aoDuplicar(compra, motivo) {
      // Mesma sessão de pagamento por outro evento é a MESMA cobrança: nada a estornar.
      if (motivo === "mesma_sessao") return;
      await avisarDonosDaInstalacao(admin, {
        titulo: "Compra repetida: conferir e estornar na Stripe",
        corpo: `Chegou uma compra repetida de ${mascararEmail(compra.email)} (${MOTIVOS[motivo] ?? motivo}). Nenhuma empresa nem convite foi criado. Confira o pagamento na Stripe e estorne a cobrança. Compra: ${compra.id}.`,
        botao: null,
      });
    },
  };
}
