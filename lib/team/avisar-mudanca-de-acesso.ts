/**
 * Avisa por e-mail a pessoa cujo acesso mudou (papel, remoção, reativação).
 * Chamado DEPOIS da mutação ter dado certo, pelas rotas `team/[user_id]/{role,revoke,reactivate}`.
 * Melhor esforço: nunca lança, e o e-mail da pessoa não vai para o log (só hash).
 */
import { hashEmail } from "@/lib/audit";
import { sendEmail } from "@/lib/email/roteador";
import { buildAvisoDeMudancaDeAcesso, type MudancaDeAcesso } from "@/lib/email/templates/mudanca-de-acesso";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AvisoDeMudancaDeAcessoArgs {
  mudanca: MudancaDeAcesso;
  autorId: string;
  /** Já verificado pela rota como membro da empresa do autor. */
  alvoId: string;
  empresa: string;
  orgId: string;
  requestId: string;
}

export async function avisarMudancaDeAcesso(args: AvisoDeMudancaDeAcessoArgs): Promise<void> {
  const { mudanca, autorId, alvoId, empresa, orgId, requestId } = args;
  if (alvoId === autorId) return;
  if (mudanca.tipo === "papel_alterado" && mudanca.papel === mudanca.papelAnterior) return;

  let emailHash: string | undefined;
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(alvoId);
    const email = data?.user?.email;
    if (error || !email) {
      logger.warn("[team.aviso_de_acesso] sem e-mail para avisar", { requestId, organization_id: orgId, tipo: mudanca.tipo });
      return;
    }
    emailHash = hashEmail(email);
    const meta = data.user.user_metadata;
    const idioma = normalizarIdioma(typeof meta?.locale === "string" ? meta.locale : null);
    const corpo = buildAvisoDeMudancaDeAcesso({ ...mudanca, empresa, idioma });
    const envio = await sendEmail({ to: email, ...corpo });
    if (!envio.ok) {
      logger.warn("[team.aviso_de_acesso] aviso não saiu", {
        requestId, organization_id: orgId, tipo: mudanca.tipo, email_hash: emailHash, erro: envio.error,
      });
    }
  } catch (err) {
    logger.warn("[team.aviso_de_acesso] aviso lançou", {
      requestId, organization_id: orgId, tipo: mudanca.tipo, email_hash: emailHash,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
}
