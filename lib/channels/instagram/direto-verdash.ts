/**
 * Cliente do fluxo "Conectar o Instagram direto pelo CRM": a ponta que fala com a plataforma.
 *
 * ─── Autenticação ────────────────────────────────────────────────────────────
 *
 * O segredo do parceiro viaja em `X-Crm-Segredo` e NÃO em `Authorization`: o gateway da
 * plataforma sobrescreve esse header com a chave dele. Ele existe só no servidor
 * (`VERDASH_CRM_PARTNER_SECRET`) e nunca entra em log, erro ou resposta daqui.
 *
 * ─── O que este arquivo não faz ──────────────────────────────────────────────
 *
 * Não decide quem pode conectar nem de que organização: recebe tudo resolvido por quem
 * chama (sessão, nunca corpo). Nada do que volta da plataforma é repassado cru à tela:
 * o desfecho vira um código fechado (`ErroDoPedido`).
 */

export type ErroDoPedido =
  | "nao_configurado"
  | "limite_de_orgs"
  | "recusado"
  | "pedido_invalido"
  | "pedido_ja_concluido"
  | "pedido_nao_autorizado"
  | "pedido_expirado"
  | "indisponivel";

export type Resultado<T> = { ok: true; data: T } | { ok: false; erro: ErroDoPedido };

const BASE_PADRAO = "https://api.verdash.com.br";
const TIMEOUT_MS = 20_000;

function segredoDoParceiro(): string | null {
  const s = process.env.VERDASH_CRM_PARTNER_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

/** `||` com `trim()`: variável vazia no `.env` cai no padrão, não numa URL sem host. */
export function baseDaApiDoParceiro(): string {
  return (process.env.VERDASH_CRM_API_BASE_URL?.trim() || BASE_PADRAO).replace(/\/+$/, "");
}

/**
 * A instalação oferece o fluxo direto? Sem o segredo do parceiro a opção some da tela
 * (e as rotas respondem 404): um botão que sempre falha é pior que botão nenhum.
 */
export function instagramDiretoConfigurado(): boolean {
  return segredoDoParceiro() !== null;
}

async function chamar(
  rota: "iniciar" | "concluir" | "desconectar",
  corpo: Record<string, unknown>,
): Promise<Resultado<Record<string, unknown>>> {
  const segredo = segredoDoParceiro();
  if (!segredo) return { ok: false, erro: "nao_configurado" };

  let res: Response;
  try {
    res = await fetch(`${baseDaApiDoParceiro()}/crm/v1/instagram/${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Crm-Segredo": segredo },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, erro: "indisponivel" };
  }

  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; error?: unknown; data?: Record<string, unknown> }
    | null;

  if (res.ok && json?.success === true && json.data && typeof json.data === "object") {
    return { ok: true, data: json.data };
  }

  const codigo = typeof json?.error === "string" ? json.error : "";
  if (res.status === 429) return { ok: false, erro: "limite_de_orgs" };
  if (res.status === 401 || res.status === 403) return { ok: false, erro: "recusado" };
  if (res.status === 410) return { ok: false, erro: "pedido_expirado" };
  if (res.status === 409) {
    return {
      ok: false,
      erro: codigo === "pedido_nao_autorizado" ? "pedido_nao_autorizado" : "pedido_ja_concluido",
    };
  }
  // 422 e 400 (pedido, nonce ou conclusão errados dão a MESMA resposta lá, de propósito).
  if (res.status === 422 || res.status === 400 || res.status === 404) {
    return { ok: false, erro: rota === "iniciar" ? "recusado" : "pedido_invalido" };
  }
  return { ok: false, erro: "indisponivel" };
}

export interface PedidoIniciado {
  pedidoId: string;
  authorizeUrl: string;
}

/** O formato de `data` na resposta de `iniciar`: `{pedido_id, authorize_url, expira_em}`. */
export async function iniciarPedido(input: {
  orgExternaId: string;
  webhookUrl: string;
  webhookSecret: string;
  nonceHash: string;
  returnUrl: string;
  rotulo: string;
}): Promise<Resultado<PedidoIniciado>> {
  const r = await chamar("iniciar", {
    org_externa_id: input.orgExternaId,
    webhook_url: input.webhookUrl,
    webhook_secret: input.webhookSecret,
    nonce_hash: input.nonceHash,
    return_url: input.returnUrl,
    rotulo: input.rotulo,
  });
  if (!r.ok) return r;
  const pedidoId = r.data.pedido_id;
  const authorize = r.data.authorize_url;
  // A navegação vai para onde a plataforma mandar: só https vale.
  if (typeof pedidoId !== "string" || typeof authorize !== "string" || !authorize.startsWith("https://")) {
    return { ok: false, erro: "indisponivel" };
  }
  return { ok: true, data: { pedidoId, authorizeUrl: authorize } };
}

export interface PedidoConcluido {
  vinculoId: string;
  instanciaId: string;
  /** Aparece UMA vez. Quem recebe cifra e grava; não loga, não devolve. */
  token: string;
  username: string | null;
  displayName: string | null;
  status: string | null;
}

export async function concluirPedido(input: {
  pedidoId: string;
  nonce: string;
  conclusao: string;
}): Promise<Resultado<PedidoConcluido>> {
  const r = await chamar("concluir", {
    pedido_id: input.pedidoId,
    nonce: input.nonce,
    conclusao: input.conclusao,
  });
  if (!r.ok) return r;
  const d = r.data;
  if (typeof d.token !== "string" || typeof d.vinculo_id !== "string" || typeof d.instancia_id !== "string") {
    return { ok: false, erro: "indisponivel" };
  }
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    ok: true,
    data: {
      vinculoId: d.vinculo_id,
      instanciaId: d.instancia_id,
      token: d.token,
      username: texto(d.username),
      displayName: texto(d.display_name),
      status: texto(d.status),
    },
  };
}

export async function desconectarVinculo(input: {
  vinculoId: string;
  orgExternaId: string;
}): Promise<Resultado<Record<string, unknown>>> {
  return chamar("desconectar", { vinculo_id: input.vinculoId, org_externa_id: input.orgExternaId });
}
