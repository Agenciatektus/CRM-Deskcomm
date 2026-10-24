/**
 * Verdash NATIVO: o CRM cria a instancia direto no FZAP (Fatia 2 do plano).
 *
 * Duas credenciais, e so duas. O CRM NUNCA guarda nem usa o ADMIN_TOKEN do FZAP:
 *
 *   - token da PASTA da organizacao (`verdash_fzap_pastas`, cifrado): cria, lista
 *     e apaga instancia, so dentro da pasta;
 *   - token da INSTANCIA (gerado aqui, cifrado em `channel_sessions`): conecta,
 *     le o QR, desliga.
 *
 * O FZAP NAO garante nome unico (POST duplicado devolve 201 e cria outra linha).
 * Por isso o nome carrega um sufixo aleatorio e e conferido na lista antes de
 * criar, e TODA operacao seguinte usa o `id` do FZAP: o nome nunca e chave.
 *
 * Operacao destrutiva (desligar, apagar) rele a instancia na pasta e confere
 * `metadata.organization_id` antes de agir.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { fzapRequest } from "./client";
import { verdashBaseUrl } from "./credentials";
import type { VerdashCredentials } from "./credentials";

export interface PastaFzap {
  folderId: string;
  /** Credencial da PASTA: o header `token` leva o token dela. */
  creds: VerdashCredentials;
}

export interface InstanciaNativa {
  fzapId: string;
  instanceName: string;
  /** Em claro so para o chamador cifrar/gravar; ja vem tambem cifrado abaixo. */
  instanceToken: string;
  tokenEncrypted: string;
}

export type EstadoNativo = "conectado" | "aguardando_qr" | "desconectado";

interface InstanciaDaLista {
  id?: string;
  name?: string;
  metadata?: { organization_id?: string } | null;
}

/** Slug seguro para nome de instancia (so [a-z0-9-]). */
function slug(v: string): string {
  return v.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

/** `crm-{org}-{rotulo}-{6hex}`. O rotulo humano mora em display_name, nao aqui. */
export function nomeDaInstanciaNativa(orgSlug: string, rotulo: string): string {
  return `crm-${slug(orgSlug)}-${slug(rotulo)}-${randomBytes(3).toString("hex")}`;
}

/** A pasta da organizacao, ou null se ainda nao foi provisionada (runbook da Tektus). */
export async function lerPastaDaOrg(
  admin: SupabaseClient,
  organizationId: string,
): Promise<PastaFzap | null> {
  const { data, error } = await admin
    .from("verdash_fzap_pastas")
    .select("fzap_folder_id, folder_token_encrypted")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`verdash_pasta_lookup_failed: ${error.code ?? "sem_codigo"}`);
  if (!data) return null;
  const token = await decryptWebhookSecret(admin, data.folder_token_encrypted as unknown as string);
  if (!token) return null;
  return {
    folderId: data.fzap_folder_id as string,
    creds: { instanceName: "", token, vinculoId: null, baseUrl: verdashBaseUrl() },
  };
}

async function pastaOuErro(admin: SupabaseClient, organizationId: string): Promise<PastaFzap> {
  const pasta = await lerPastaDaOrg(admin, organizationId);
  if (!pasta) throw new Error("verdash_nativo_sem_pasta");
  return pasta;
}

async function listarDaPasta(pasta: PastaFzap): Promise<InstanciaDaLista[]> {
  const data = await fzapRequest<InstanciaDaLista[] | { instances?: InstanciaDaLista[] }>(
    pasta.creds,
    "/folder/instances",
  );
  return Array.isArray(data) ? data : (data?.instances ?? []);
}

/**
 * Guard: relê a instancia NA PASTA (por id) e confere a organizacao. Instancia
 * fora da pasta nao aparece na lista; metadata de outra org ou ausente recusa.
 */
async function exigirInstanciaDaOrg(
  pasta: PastaFzap,
  organizationId: string,
  fzapId: string,
): Promise<void> {
  const inst = (await listarDaPasta(pasta)).find((i) => i.id === fzapId);
  if (!inst) throw new Error("verdash_nativo_instancia_nao_encontrada");
  if (inst.metadata?.organization_id !== organizationId) {
    throw new Error("verdash_nativo_guard_org_divergente");
  }
}

function proxyBr(): string {
  const url = process.env.FZAP_PROXY_URL_BR?.trim();
  if (!url) throw new Error("verdash_nativo_proxy_ausente");
  return url;
}

export async function apagarNativo(
  admin: SupabaseClient,
  input: { organizationId: string; fzapId: string },
): Promise<void> {
  const pasta = await pastaOuErro(admin, input.organizationId);
  await exigirInstanciaDaOrg(pasta, input.organizationId, input.fzapId);
  await fzapRequest(pasta.creds, `/folder/instances/${encodeURIComponent(input.fzapId)}/full`, {
    method: "DELETE",
  });
}

/**
 * Cria a instancia na pasta da org, com proxy BR. Qualquer falha depois do POST
 * apaga a instancia orfa (`/full`) e propaga o erro original.
 */
export async function criarInstanciaNativa(
  admin: SupabaseClient,
  input: { organizationId: string; orgSlug: string; rotulo: string; channelSessionId?: string },
): Promise<InstanciaNativa> {
  const proxyUrl = proxyBr();
  const pasta = await pastaOuErro(admin, input.organizationId);

  const instanceToken = randomBytes(24).toString("hex");
  const tokenEncrypted = await encryptWebhookSecret(admin, instanceToken);
  if (!tokenEncrypted) throw new Error("verdash_nativo_cifra_indisponivel");

  // O FZAP aceita nome repetido: confere a lista e sorteia de novo se colidir.
  const existentes = new Set((await listarDaPasta(pasta)).map((i) => i.name));
  let instanceName = nomeDaInstanciaNativa(input.orgSlug, input.rotulo);
  while (existentes.has(instanceName)) {
    instanceName = nomeDaInstanciaNativa(input.orgSlug, input.rotulo);
  }

  const criada = await fzapRequest<{ id?: string }>(pasta.creds, "/folder/instances", {
    method: "POST",
    body: {
      name: instanceName,
      token: instanceToken,
      expiration: 0,
      proxyConfig: { enabled: true, proxyUrl },
      s3Config: { enabled: false },
      metadata: {
        sistema: "crm",
        organization_id: input.organizationId,
        ...(input.channelSessionId ? { channel_session_id: input.channelSessionId } : {}),
      },
    },
  });
  const fzapId = criada?.id;
  if (!fzapId) throw new Error("verdash_nativo_criacao_sem_id");

  try {
    await fzapRequest({ ...pasta.creds, token: instanceToken }, "/session/proxy/test", {
      method: "POST",
      body: { proxyUrl },
    });
  } catch {
    // Mensagem fixa: o erro do provider pode ecoar a URL do proxy, que e segredo.
    await limparOrfa(pasta, fzapId);
    throw new Error("verdash_nativo_proxy_falhou");
  }

  return { fzapId, instanceName, instanceToken, tokenEncrypted };
}

async function limparOrfa(pasta: PastaFzap, fzapId: string): Promise<void> {
  await fzapRequest(pasta.creds, `/folder/instances/${encodeURIComponent(fzapId)}/full`, {
    method: "DELETE",
  }).catch(() => {
    // Best-effort: o erro que importa e o da criacao, que quem chama recebe.
  });
}

/** Pede a conexao e devolve o QR (data URL) ou null enquanto nao estiver pronto. */
export async function obterQrNativo(creds: VerdashCredentials): Promise<string | null> {
  await fzapRequest(creds, "/session/connect", { method: "POST", body: {} });
  const data = await fzapRequest<{ qrCode?: string }>(creds, "/session/qr");
  return data?.qrCode || null;
}

export async function statusNativo(creds: VerdashCredentials): Promise<EstadoNativo> {
  const data = await fzapRequest<{ connected?: boolean; loggedIn?: boolean }>(
    creds,
    "/session/status",
  );
  if (data?.connected && data?.loggedIn) return "conectado";
  if (data?.connected) return "aguardando_qr";
  return "desconectado";
}

/** disconnect + logout, depois de conferir que a instancia e desta org. */
export async function desligarNativo(
  admin: SupabaseClient,
  input: { organizationId: string; fzapId: string; creds: VerdashCredentials },
): Promise<void> {
  const pasta = await pastaOuErro(admin, input.organizationId);
  await exigirInstanciaDaOrg(pasta, input.organizationId, input.fzapId);
  await fzapRequest(input.creds, "/session/disconnect", { method: "POST", body: {} });
  await fzapRequest(input.creds, "/session/logout", { method: "POST", body: {} });
}
