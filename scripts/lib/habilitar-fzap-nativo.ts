/**
 * Lógica pura de `scripts/habilitar-fzap-nativo.ts`: habilita/desabilita o modo
 * nativo (FZAP) de UMA organização. Tudo que toca banco, rede ou cifra entra por
 * `Deps`, para o teste rodar sem nada disso.
 *
 * O token da pasta NUNCA sai daqui em mensagem, erro ou resultado: ele só vai
 * para `deps.listarDaPasta` e `deps.cifrar`. Todo texto devolvido é montado sem
 * ele, e o que vem de fora (erro da rede) passa por `semToken`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InstanciaDaPasta {
  metadata?: { organization_id?: string } | null;
  [k: string]: unknown;
}

/** O que o FZAP devolve em `GET /folder/instances` (lista, ou objeto com a lista). */
export type RespostaDaPasta =
  | InstanciaDaPasta[]
  | { users?: InstanciaDaPasta[]; instances?: InstanciaDaPasta[]; [k: string]: unknown }
  | null
  | undefined;

export interface Deps {
  /** `null` = a organização não existe. */
  buscarOrg(id: string): Promise<{ id: string; status: string } | null>;
  /** Organização dona dessa pasta, ou `null`. */
  donoDaPasta(folderId: string): Promise<string | null>;
  /** GET /folder/instances com o token da pasta. Lança `verdash_request_failed: <status> ...`. */
  listarDaPasta(token: string): Promise<RespostaDaPasta>;
  /** `null` = cifra indisponível (GUC da chave ausente). */
  cifrar(token: string): Promise<string | null>;
  /** Upsert por `organization_id`. */
  gravar(orgId: string, folderId: string, cifrado: string): Promise<void>;
  /** Devolve quantas linhas apagou. */
  apagar(orgId: string): Promise<number>;
}

export interface Pedido {
  orgId: string;
  pastaId: string;
  token: string;
  aplicar: boolean;
  proxyBrPresente: boolean;
}

export interface Resultado {
  ok: boolean;
  /** Linhas para o operador. Nunca contém o token. */
  linhas: string[];
  escreveu: boolean;
}

export const PROXIMOS_PASSOS = [
  "Garantir no servidor do CRM: FZAP_PROXY_URL_BR (proxy SOCKS5 BR) e VERDASH_API_BASE_URL=http://10.0.1.1:8081.",
  "Testar com número de teste: Conectar por QR, receber e enviar uma mensagem, ver o canal em WORKING e o telefone preenchido.",
];

export function semToken(texto: string, token: string): string {
  return token === "" ? texto : texto.split(token).join("[token]");
}

export function uuidValido(v: string | undefined): v is string {
  return typeof v === "string" && UUID.test(v);
}

function instancias(r: RespostaDaPasta): InstanciaDaPasta[] {
  return Array.isArray(r) ? r : (r?.users ?? r?.instances ?? []);
}

function idDaPastaNaResposta(r: RespostaDaPasta): string | null {
  if (!r || Array.isArray(r)) return null;
  const v = (r.folderId ?? r.folder_id ?? (r.folder as { id?: unknown } | undefined)?.id) as unknown;
  return typeof v === "string" && v !== "" ? v : null;
}

const falha = (linhas: string[]): Resultado => ({ ok: false, linhas, escreveu: false });

export async function habilitar(deps: Deps, p: Pedido): Promise<Resultado> {
  const linhas: string[] = [];
  if (!uuidValido(p.orgId)) return falha(["--org precisa ser um uuid."]);
  if (p.pastaId.trim() === "") return falha(["--pasta (id da pasta no FZAP) é obrigatório."]);
  if (p.token === "") return falha(["FZAP_PASTA_TOKEN ausente no ambiente (nunca por argumento)."]);

  const org = await deps.buscarOrg(p.orgId);
  if (!org) return falha([`Organização ${p.orgId} não existe.`]);
  if (org.status !== "active") {
    return falha([`Organização ${p.orgId} não está ativa (status: ${org.status}). Recusado.`]);
  }
  linhas.push(`Organização ${p.orgId} existe e está ativa.`);

  let resposta: RespostaDaPasta;
  try {
    resposta = await deps.listarDaPasta(p.token);
  } catch (err) {
    const m = err instanceof Error ? semToken(err.message, p.token) : "erro_desconhecido";
    const status = /verdash_request_failed: (\d{3})/.exec(m)?.[1];
    if (status === "401" || status === "403") {
      return falha([...linhas, `FZAP recusou o token da pasta (HTTP ${status}). Confira FZAP_PASTA_TOKEN.`]);
    }
    if (status === "404") return falha([...linhas, "FZAP respondeu 404 para a pasta. Confira --pasta e a base da API."]);
    return falha([...linhas, `Não consegui validar a pasta no FZAP: ${status ? `HTTP ${status}` : m.slice(0, 120)}.`]);
  }

  const doFzap = idDaPastaNaResposta(resposta);
  if (doFzap !== null && doFzap !== p.pastaId) {
    return falha([...linhas, "O token pertence a outra pasta do FZAP que não a de --pasta. Recusado."]);
  }
  const alheia = instancias(resposta).find(
    (i) => i.metadata?.organization_id && i.metadata.organization_id !== p.orgId,
  );
  if (alheia) {
    return falha([...linhas, "A pasta tem instância de OUTRA organização. Recusado."]);
  }
  linhas.push(
    doFzap !== null
      ? "Pasta validada no FZAP (200, id confere)."
      : "Token da pasta aceito pelo FZAP (200). AVISO: a resposta não traz o id da pasta; o id de --pasta não foi conferido no FZAP.",
  );

  const dono = await deps.donoDaPasta(p.pastaId);
  if (dono !== null && dono !== p.orgId) {
    return falha([...linhas, `A pasta ${p.pastaId} já pertence a OUTRA organização (${dono}). Recusado.`]);
  }

  if (!p.proxyBrPresente) {
    linhas.push("AVISO: FZAP_PROXY_URL_BR ausente neste ambiente. No servidor do CRM ela é obrigatória: sem ela a criação de instância falha de propósito.");
  }

  if (!p.aplicar) {
    linhas.push("DRY-RUN: nada foi gravado. Rode com --aplicar para gravar a pasta (token cifrado) em verdash_fzap_pastas.");
    return { ok: true, linhas, escreveu: false };
  }

  const cifrado = await deps.cifrar(p.token);
  if (!cifrado) return falha([...linhas, "Cifra indisponível (chave app.nuvemshop_oauth_key ausente no banco). Nada gravado."]);
  await deps.gravar(p.orgId, p.pastaId, cifrado);
  linhas.push(dono === p.orgId ? "Pasta atualizada (upsert idempotente)." : "Pasta gravada. O botão 'Conectar por QR' passa a aparecer na organização.");
  linhas.push("Falta fazer:", ...PROXIMOS_PASSOS.map((s) => `  - ${s}`));
  return { ok: true, linhas, escreveu: true };
}

export async function desabilitar(deps: Deps, p: { orgId: string; aplicar: boolean }): Promise<Resultado> {
  if (!uuidValido(p.orgId)) return falha(["--org precisa ser um uuid."]);
  const org = await deps.buscarOrg(p.orgId);
  if (!org) return falha([`Organização ${p.orgId} não existe.`]);
  if (!p.aplicar) {
    return { ok: true, escreveu: false, linhas: ["DRY-RUN: removeria a linha de verdash_fzap_pastas (canais já criados continuam; novos não). Use --aplicar."] };
  }
  const n = await deps.apagar(p.orgId);
  return {
    ok: true,
    escreveu: n > 0,
    linhas: [n > 0 ? "Linha removida. Canais já criados continuam; novos não." : "A organização já não tinha pasta. Nada a remover."],
  };
}
