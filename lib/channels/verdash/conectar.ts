/**
 * Conectar o canal Verdash — do lado de dentro do seam.
 *
 * ─── A diferença de UX que este canal permite, e os outros não ──────────────
 *
 * Conectar um canal são sempre DUAS pontas: a credencial, que deixa o CRM
 * FALAR com o provedor, e o webhook, que deixa o provedor falar com o CRM. Nos
 * canais por credencial existentes a segunda ponta é MANUAL — o operador copia
 * uma URL e um segredo e vai colar no painel do outro sistema. Quem faz só a
 * primeira consegue enviar e nunca recebe, e o defeito aparece horas depois
 * como "o cliente respondeu e não chegou".
 *
 * Aqui não precisa. O token da instância autoriza também a API de webhooks do
 * FZAP, então o CRM REGISTRA A VOLTA SOZINHO. O operador cola uma coisa só, e o
 * passo em que a maioria das conexões falha simplesmente não existe.
 *
 * ─── Por que o registro é ADITIVO, e por que isso importa muito ─────────────
 *
 * O FZAP aceita VÁRIOS webhooks por instância. Isso não é detalhe: a instância
 * do cliente JÁ TEM um webhook apontando para a Verdash, que é o que alimenta
 * rastreio, atribuição de anúncio e CAPI. Substituí-lo faria o CRM funcionar e
 * quebraria, em silêncio, o produto que o cliente já usava.
 *
 * Então acrescentamos o nosso ao lado, e removemos apenas os que apontam para
 * ESTA instalação do CRM (reconectar não pode empilhar duplicatas). O da
 * Verdash — e o de qualquer outro sistema — não é tocado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "../archived";
import { CHANNEL_PROVIDER_VERDASH } from "../capabilities";
import { fzapRequest } from "./client";
import { verdashBaseUrl } from "./credentials";
import type { ChannelProvider } from "../types";

export const VERDASH_CHANNEL_PROVIDER: ChannelProvider = CHANNEL_PROVIDER_VERDASH;

/**
 * Como o canal se chama PARA O USUÁRIO.
 *
 * Quem instala reconhece a marca do serviço que já usa; "provedor parceiro"
 * obrigaria a adivinhar.
 */
export const VERDASH_CHANNEL_LABEL = "Verdash";

/**
 * Os eventos que o CRM quer receber.
 *
 * Lista explícita, e não `All`: `All` traz sincronização de histórico, presença,
 * estado de app e sinalização de chamada — dezenas de eventos por minuto que o
 * CRM descarta, cada um custando uma requisição HTTP e uma linha de log. Pedir
 * o que se usa é a diferença entre um webhook e uma mangueira.
 *
 * `AutomationMessage` entra junto de `Message` porque é mensagem de verdade: é
 * o que o próprio FZAP manda por automação, e deixá-la de fora esconderia do
 * histórico o que o cliente recebeu sem ninguém digitar.
 */
const EVENTOS = ["Message", "AutomationMessage", "Connected", "Disconnected", "LoggedOut"];

/**
 * O header por onde o segredo do CRM viaja em cada entrega.
 *
 * Nome NEUTRO de propósito: este CRM é white-label, e um header com a marca
 * dentro seria marca fixada em código — a catraca de `tests/unit/branding.test.ts`
 * cobra isso, e com razão. Aqui não há compatibilidade a preservar: o header
 * nasce agora.
 */
export const HEADER_DO_SEGREDO = "X-Webhook-Secret";

export type VerdashValidacao =
  | {
      ok: true;
      instanceName: string;
      phoneNumber: string | null;
      displayName: string;
      connected: boolean;
    }
  | { ok: false; reason: string };

/**
 * O token presta? E de qual instância ele é?
 *
 * Perguntado ao FZAP ANTES de gravar qualquer coisa. Gravar primeiro e
 * descobrir depois é o que faz o operador achar que conectou e só entender que
 * não na primeira mensagem que não sai, com o cliente do outro lado esperando.
 *
 * Repare que o nome da instância NÃO é pedido ao usuário: ele vem da resposta.
 * Pedir os dois abriria a porta para colar o token de uma instância e o nome de
 * outra — e o CRM passaria a mandar mensagem por um número acreditando ser
 * outro.
 */
export async function validateVerdashToken(token: string): Promise<VerdashValidacao> {
  let data: {
    id?: string;
    name?: string;
    connected?: boolean;
    loggedIn?: boolean;
    jid?: string;
  };
  try {
    data = await fzapRequest(
      { instanceName: "", token, baseUrl: verdashBaseUrl() },
      "/session/status",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("401") || msg.includes("403")) {
      return { ok: false, reason: "Token não reconhecido pela Verdash. Confira e cole de novo." };
    }
    if (msg.startsWith("verdash_unreachable")) {
      return { ok: false, reason: "Não foi possível falar com a Verdash agora. Tente em instantes." };
    }
    return { ok: false, reason: "A Verdash recusou a consulta com este token." };
  }

  const instanceName = typeof data?.name === "string" ? data.name.trim() : "";
  if (!instanceName) {
    return { ok: false, reason: "A Verdash não informou qual instância é esta." };
  }

  // O número sai do JID (`556681276920:50@s.whatsapp.net`). Pode não existir
  // ainda — instância criada e nunca pareada —, e isso não impede conectar: o
  // número aparece sozinho quando o pareamento acontecer.
  const digitos = (data.jid ?? "").split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? "";

  return {
    ok: true,
    instanceName,
    phoneNumber: digitos.length >= 8 ? `+${digitos}` : null,
    displayName: instanceName,
    connected: Boolean(data.connected && data.loggedIn !== false),
  };
}

/**
 * Registra a volta: o webhook do CRM na instância do cliente.
 *
 * ADITIVO — ver o cabeçalho. Remove só o que aponta para esta instalação, para
 * que reconectar não empilhe entregas duplicadas (e mensagem duplicada no inbox
 * do cliente).
 *
 * Best-effort do lado de FORA: quem chama decide o que fazer com a falha. Ela
 * não pode derrubar a conexão inteira — um canal que fala e não ouve ainda é
 * melhor que nenhum canal, desde que a tela DIGA isso, que é justamente o que
 * o retorno permite.
 */
export async function registrarWebhookNaVerdash(input: {
  token: string;
  webhookUrl: string;
  segredo: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const creds = { instanceName: "", token: input.token, baseUrl: verdashBaseUrl() };

  try {
    const existentes = await fzapRequest<Array<{ id?: string; url?: string }>>(creds, "/webhook");
    for (const w of existentes ?? []) {
      // Só o NOSSO. O da Verdash (e o de qualquer outro sistema) fica onde está.
      if (w?.id && w?.url === input.webhookUrl) {
        await fzapRequest(creds, `/webhook/${encodeURIComponent(w.id)}`, { method: "DELETE" });
      }
    }
  } catch {
    // Listar é conveniência: se falhar, seguimos e criamos. O pior caso é uma
    // entrega duplicada, que a chave `(organization_id, external_id)` já
    // absorve como `duplicate` na ingestão.
  }

  try {
    await fzapRequest(creds, "/webhook", {
      method: "POST",
      body: {
        url: input.webhookUrl,
        events: EVENTOS,
        // O rótulo é para o humano que abrir o painel da Verdash e se perguntar
        // de quem é este webhook. Sem ele, some no meio dos outros.
        label: "CRM",
        headers: { [HEADER_DO_SEGREDO]: input.segredo },
      },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return { ok: false, reason: msg.slice(0, 200) };
  }
}

export interface VerdashSession {
  id: string;
  instanceName: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  status: string | null;
  webhookPathToken: string | null;
  hasToken: boolean;
  archivedAt: string | null;
}

const COLUNAS =
  "id, verdash_instance_name, phone_number, display_name, status, webhook_path_token, verdash_token_encrypted";

function toVerdashSession(row: Record<string, unknown> | null): VerdashSession | null {
  if (!row) return null;
  return {
    id: row.id as string,
    instanceName: (row.verdash_instance_name as string) ?? null,
    phoneNumber: (row.phone_number as string) ?? null,
    displayName: (row.display_name as string) ?? null,
    status: (row.status as string) ?? null,
    webhookPathToken: (row.webhook_path_token as string) ?? null,
    // Existe, não qual é.
    hasToken: !!row.verdash_token_encrypted,
    archivedAt: (row.archived_at as string) ?? null,
  };
}

export async function findVerdashSession(
  admin: SupabaseClient,
  organizationId: string,
): Promise<VerdashSession | null> {
  const buscar = (colunas: string) =>
    admin
      .from("channel_sessions")
      .select(colunas)
      .eq("organization_id", organizationId)
      .eq("provider", VERDASH_CHANNEL_PROVIDER)
      .maybeSingle();

  const { data } = await queryTolerantToMissingArchived(
    () => buscar(`${COLUNAS}, ${ARCHIVED_AT}`),
    () => buscar(COLUNAS),
  );
  return toVerdashSession(data as Record<string, unknown> | null);
}

/**
 * Grava (ou ressuscita) a sessão.
 *
 * `archived_at: null` sempre: reconectar por cima de um canal excluído precisa
 * trazê-lo de volta. Sem isso o update deixaria a coluna no lugar e o canal
 * "conectado" ficaria invisível para o webhook, o envio e os seletores — todos
 * filtrados por ela.
 */
export async function saveVerdashSession(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    existingId: string | null;
    instanceName: string;
    tokenEncrypted: string;
    webhookPathToken: string;
    webhookSecretEncrypted: string;
    phoneNumber: string | null;
    displayName: string;
    connected: boolean;
  },
): Promise<{ error: string | null }> {
  const linha = {
    organization_id: input.organizationId,
    provider: VERDASH_CHANNEL_PROVIDER,
    verdash_instance_name: input.instanceName,
    verdash_token_encrypted: input.tokenEncrypted,
    webhook_path_token: input.webhookPathToken,
    webhook_secret_encrypted: input.webhookSecretEncrypted,
    phone_number: input.phoneNumber,
    display_name: input.displayName,
    // O status é o que a Verdash ACABOU de dizer, não um otimismo. Uma
    // instância criada e ainda não pareada nasce `STARTING`, e a tela mostra
    // isso em vez de prometer um canal que ainda não fala.
    status: input.connected ? "WORKING" : "STARTING",
    archived_at: null,
  };

  const { error } = input.existingId
    ? await admin.from("channel_sessions").update(linha).eq("id", input.existingId)
    : await admin
        .from("channel_sessions")
        .insert({ ...linha, metadata: metadataInicialDoCanal() });

  return { error: error?.message ?? null };
}
