/**
 * Credenciais do canal Verdash — **por sessão, e só por sessão**.
 *
 * Aqui mora a diferença que motivou este provider existir. O FZAP (o servidor
 * de WhatsApp da Verdash) tem DOIS níveis de autenticação:
 *
 *   - `Authorization: <ADMIN_TOKEN>` — chave do SERVIDOR. Abre todas as
 *     instâncias de todos os clientes, cria e apaga instância, lê token alheio.
 *   - `token: <token da instância>` — chave DAQUELA linha. Fala por um número
 *     e só por ele.
 *
 * O atalho barato era o primeiro: um `.env` com o admin token e a camada de
 * compatibilidade WAHA respondendo para tudo. Funciona no mesmo dia, e é por
 * isso que tenta. O custo é que o CRM de UM cliente passa a carregar a chave
 * que abre a caixa de entrada de TODOS os outros — e a chave do servidor não
 * pode ser rotacionada por cliente, nem revogada quando um cliente sai.
 *
 * Por isso, e diferente de `../zernio/credentials.ts`, **não existe fallback de
 * env para o token**. Sessão sem token gravado é canal não conectado, ponto. Um
 * fallback aqui reintroduziria a chave mestra pela porta dos fundos, e o modo
 * de falha seria o pior possível: funcionaria.
 *
 * Só a BASE da API vem do ambiente, porque ela não é segredo — é endereço, e
 * muda por instalação (na produção da Tektus o FZAP responde na rede interna da
 * VPS, não pelo domínio público).
 *
 * A cifra usa as MESMAS RPCs do resto do repo (`fn_encrypt_oauth` /
 * `fn_decrypt_oauth`, ver `lib/webhooks/secrets.ts`) — um terceiro caminho de
 * cifra seria mais um lugar por onde a chave vaza.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "../archived";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export interface VerdashCredentials {
  /** `channel_sessions.verdash_instance_name` — o `sessionRef` deste canal. */
  instanceName: string;
  /**
   * A credencial. O que ela É depende do modo:
   *
   *  - modo DIRETO   → o token da instância no FZAP;
   *  - modo PAREADO  → um token de máquina emitido pela Verdash, com escopo de
   *                    uma instância, que só serve para pedir envio a ela.
   *
   * Em nenhum dos dois é o admin token do servidor, que abriria todas as
   * instâncias de todos os clientes de uma vez.
   */
  token: string;
  /**
   * Id do vínculo na Verdash. Presente = modo PAREADO.
   *
   * É o dado que decide por onde a mensagem sai, e por isso ele vem do BANCO e
   * não de um palpite sobre o formato do token: os dois são hexadecimais, e
   * adivinhar pelo tamanho quebraria em silêncio no dia em que um dos lados
   * mudasse — mandando a mensagem pelo transporte errado.
   */
  vinculoId: string | null;
  baseUrl: string;
}

export interface VerdashCredsLookup {
  /** Resolvido de fonte confiável (sessão, linha já escopada, token do webhook). */
  organizationId: string;
  instanceName: string;
}

/**
 * Base da API do FZAP.
 *
 * `||` e não `??`, com `trim()` junto: o `.env.example` entrega a chave VAZIA, e
 * string vazia passa pelo `??` — o defeito que `../zernio/credentials.ts`
 * documenta em detalhe e que quebrou todo envio daquele canal. Ausente e vazia
 * têm de cair no mesmo lugar.
 */
/**
 * Base das FUNÇÕES da Verdash — de onde o CRM pede o pareamento e, no modo
 * pareado, o envio.
 *
 * Mora aqui e não em `./conectar` para não fechar ciclo de import: `client.ts`
 * precisa dela para enviar, e `conectar.ts` já importa `client.ts`.
 *
 * `||` com `trim()` pelo mesmo motivo de `verdashBaseUrl` logo abaixo: string
 * vazia no `.env` tem de cair no default, senão a URL sai sem host.
 */
export function verdashFunctionsUrl(): string {
  return (
    process.env.VERDASH_FUNCTIONS_URL?.trim() || "https://supabase.verdash.com.br/functions/v1"
  );
}

export function verdashBaseUrl(): string {
  return process.env.VERDASH_API_BASE_URL?.trim() || "https://fzap.verdash.com.br";
}

/**
 * A credencial gravada nesta sessão. `null` = canal não conectado.
 *
 * **LANÇA quando a consulta falha**, e isso não é zelo: descartar o `error` foi
 * metade do defeito da issue #236 no canal irmão — `maybeSingle()` com duas
 * linhas devolve `data: null` COM `PGRST116`, e o `null` silencioso mandava o
 * envio para a credencial errada. Aqui não há credencial errada para onde ir,
 * mas há o desfecho equivalente: "canal não conectado" para um canal conectado,
 * e a mensagem parada sem ninguém saber por quê.
 */
export async function resolveVerdashCreds(
  admin: SupabaseClient,
  lookup: VerdashCredsLookup,
): Promise<VerdashCredentials | null> {
  const { organizationId, instanceName } = lookup;
  if (!organizationId || !instanceName) return null;

  // `organization_id` À MÃO (service role bypassa RLS) e `archived_at is null`
  // pelo MESMO recorte do índice único `channel_sessions_verdash_instance_unique`
  // (migration 9001): fora do recorte a trava do banco não alcança, e a busca
  // deixaria de ser exata exatamente onde ninguém a garante.
  const base = () =>
    admin
      .from("channel_sessions")
      .select("verdash_instance_name, verdash_vinculo_id, verdash_token_encrypted")
      .eq("organization_id", organizationId)
      .eq("verdash_instance_name", instanceName);
  const { data, error } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).maybeSingle(),
    () => base().maybeSingle(),
  );
  if (error) {
    throw new Error(
      `verdash_creds_lookup_failed: ${error.code ?? "sem_codigo"} ${error.message ?? ""}`.trim(),
    );
  }

  const cifrado = data?.verdash_token_encrypted;
  if (!data || !cifrado) return null;

  const token = await decryptWebhookSecret(admin, cifrado as unknown as string);
  // Decifra que falha devolve `null` (a chave da GUC pode não estar configurada
  // nesta instalação). Sem env para onde cair, o desfecho honesto é "sem
  // credencial" — e quem chama LANÇA com motivo em vez de gravar um envio que
  // nunca saiu.
  if (!token) return null;

  return {
    instanceName: data.verdash_instance_name as string,
    token,
    vinculoId: (data.verdash_vinculo_id as string) ?? null,
    baseUrl: verdashBaseUrl(),
  };
}
