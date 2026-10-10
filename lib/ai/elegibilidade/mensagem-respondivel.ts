/**
 * Esta mensagem recebida PEDE resposta da IA?
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * Desde a #148 o canal hospedado grava a reação do WhatsApp como `type =
 * 'reaction'` com o emoji no corpo, e o que ainda não sabemos ler entra sem
 * corpo, com `metadata.tipo_nao_suportado`. O canal por QR já gravava reação
 * assim. As duas coisas são INSERT de entrada, e todo INSERT de entrada acorda
 * a IA: um 👍 numa proposta virava turno do agente, com gasto de LLM e uma
 * resposta para ninguém.
 *
 * Não pedem resposta:
 *   - reação (`type = 'reaction'`);
 *   - mensagem sem texto e sem mídia: tipo não suportado, resposta de enquete
 *     cifrada, linha vazia antiga. Não há o que ler, e a IA responderia ao nada.
 *
 * Contato e localização chegam COM corpo (vCard, link do mapa) e seguem pedindo
 * resposta: o cliente que manda o endereço quer que alguém o leia. Mídia sem
 * legenda também segue: a esteira de derivação a transforma em texto.
 *
 * A mesma regra existe em SQL (`SQL_MENSAGEM_PEDE_RESPOSTA`) para o dreno do
 * agente, que fala com o Postgres direto. As duas versões andam juntas e o
 * teste `mensagem-respondivel.test.ts` prende as duas.
 */

export interface MensagemParaResposta {
  type: string | null;
  body: string | null;
  media_url?: string | null;
  media_storage_path?: string | null;
}

export type DecisaoDeResposta =
  | { pede: true }
  | { pede: false; motivo: "reacao" | "sem_conteudo" };

export function mensagemPedeResposta(m: MensagemParaResposta): DecisaoDeResposta {
  if (m.type === "reaction") return { pede: false, motivo: "reacao" };
  const temTexto = (m.body ?? "").trim().length > 0;
  const temMidia = Boolean(m.media_url || m.media_storage_path);
  if (!temTexto && !temMidia) return { pede: false, motivo: "sem_conteudo" };
  return { pede: true };
}

/**
 * O mesmo predicado, para usar num `where` sobre `messages` (sem alias).
 * Mantenha em sincronia com `mensagemPedeResposta`.
 */
export const SQL_MENSAGEM_PEDE_RESPOSTA =
  "(type <> 'reaction' and (coalesce(btrim(body), '') <> '' or media_url is not null or media_storage_path is not null))";
