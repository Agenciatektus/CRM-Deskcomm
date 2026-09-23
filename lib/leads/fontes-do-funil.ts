/**
 * DE QUE FONTES O CRM SE ALIMENTA — e o que acontece com o que ninguém quer.
 *
 * ─── A regra, em uma frase ──────────────────────────────────────────────────
 * Fonte que não está ativada em NENHUM funil da organização não entra: nem
 * lead, nem conversa, nem Inbox. O evento é arquivado e descartado.
 *
 * ─── Por que isso é mais do que um filtro de Kanban ────────────────────────
 * Porque decide a ENTRADA, não a exibição. Um filtro de tela deixaria a
 * conversa existir e só a esconderia — e aí o cliente que não quer comentário
 * continuaria pagando armazenamento, o agente de IA continuaria vendo a
 * conversa, e a contagem de "não lidas" continuaria subindo por algo que
 * ninguém vai ler. Decidir na porta é o que torna "não quero comentário" uma
 * frase verdadeira.
 *
 * O preço disso é um: quem desativa uma fonte por engano não recebe nada dela e
 * não há o que recuperar depois, porque nunca foi gravado. O evento cru fica no
 * arquivo de webhook (a fonte da verdade) — dá para reprocessar se alguém
 * perceber a tempo. É a razão de o arquivamento vir ANTES desta decisão, e não
 * depois.
 *
 * ─── Por que o default do banco é `{whatsapp}` ─────────────────────────────
 * Ver a migration 9012: se a coluna nascesse vazia, todo funil passaria a não
 * aceitar nada e o WhatsApp de quem está em produção HOJE pararia de entrar no
 * minuto seguinte ao deploy — uma interrupção de atendimento causada por uma
 * migration de configuração.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O vocabulário FECHADO, igual ao CHECK da 9012. Uma string livre aqui viraria
 * `whatsapp`, `whats` e `WhatsApp` em três instalações, e o filtro não acharia
 * nenhuma delas.
 */
export const FONTES_CONHECIDAS = [
  "whatsapp",
  "instagram_direct",
  "instagram_comentario",
] as const;

export type FonteDoFunil = (typeof FONTES_CONHECIDAS)[number];

export function ehFonteConhecida(v: string): v is FonteDoFunil {
  return (FONTES_CONHECIDAS as readonly string[]).includes(v);
}

/**
 * De qual fonte é esta conversa.
 *
 * `story` NÃO tem fonte própria: resposta a story é Direct, cai na mesma
 * conversa de DM, e separá-la aqui obrigaria o cliente a marcar duas caixas
 * para receber o que ele pensa como uma coisa só.
 */
export function fonteDaEntrada(
  canal: string,
  entradaDoInstagram?: string | null,
): FonteDoFunil | null {
  if (canal === "whatsapp") return "whatsapp";
  if (canal !== "instagram") return null;
  if (entradaDoInstagram === "comentario") return "instagram_comentario";
  if (entradaDoInstagram === "direct" || entradaDoInstagram === "story") return "instagram_direct";
  return null;
}

/**
 * Qual funil recebe esta fonte — e `null` quando NENHUM recebe.
 *
 * Devolve o primeiro por `created_at`, e isso é decisão de produto: um lead por
 * conversa, no primeiro funil que aceita. Gerar card em todos os funis que
 * aceitam poria o mesmo cliente em dois Kanbans, com dois vendedores
 * trabalhando a mesma pessoa sem saber um do outro, e fechar num não fecharia
 * no outro.
 *
 * A ordem é estável (`created_at`, depois `id`) para que a resposta não mude
 * entre duas mensagens da mesma conversa — o que faria a segunda mensagem
 * procurar o lead no funil errado.
 */
export async function funilQueAceita(
  db: SupabaseClient,
  organizationId: string,
  fonte: FonteDoFunil,
): Promise<string | null> {
  const { data, error } = await db
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .contains("fontes", [fonte])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  // O erro é LIDO e propagado como "não sei", nunca como "não aceita". Tratar
  // falha de consulta como recusa descartaria mensagem de cliente por causa de
  // um hiccup do banco — e o descarte aqui é definitivo, porque nada chega a
  // ser gravado. Quem chama decide repetir; a fila reentrega.
  if (error) throw new Error(`fontes_do_funil_indisponivel: ${error.message}`);
  return (data?.id as string) ?? null;
}
