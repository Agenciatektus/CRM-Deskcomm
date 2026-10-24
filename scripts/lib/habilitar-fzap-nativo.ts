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
  metadata?: { organization_id?: string; sistema?: string } | null;
  [k: string]: unknown;
}

/** O que o FZAP devolve em `GET /folder/instances` (medido na v1.35.2): `{ folder: {id}, users: [...] }`. */
export type RespostaDaPasta = { folder?: { id?: unknown } | null; users?: unknown; [k: string]: unknown } | null | undefined;

export interface Deps {
  /** `null` = a organização não existe. */
  buscarOrg(id: string): Promise<{ id: string; status: string } | null>;
  /** Pasta que ESTA organização já usa (`verdash_fzap_pastas`), ou `null`. */
  pastaAtualDaOrg(orgId: string): Promise<string | null>;
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

/** Id da pasta e instancias, SO se a resposta tiver o formato real; senao `null` (recusa). */
function lerResposta(r: RespostaDaPasta): { id: string; users: InstanciaDaPasta[] } | null {
  const id = r?.folder?.id;
  if (typeof id !== "string" || id === "" || !Array.isArray(r?.users)) return null;
  return { id, users: r.users as InstanciaDaPasta[] };
}

const falha = (linhas: string[]): Resultado => ({ ok: false, linhas, escreveu: false });

export async function habilitar(deps: Deps, p: Pedido): Promise<Resultado> {
  const linhas: string[] = [];
  if (!uuidValido(p.orgId)) return falha(["--org precisa ser um uuid."]);
  const pastaId = p.pastaId.trim();
  if (pastaId === "") return falha(["--pasta (id da pasta no FZAP) é obrigatório."]);
  if (p.token === "") return falha(["FZAP_PASTA_TOKEN ausente no ambiente (nunca por argumento)."]);

  const org = await deps.buscarOrg(p.orgId);
  if (!org) return falha([`Organização ${p.orgId} não existe.`]);
  if (org.status !== "active") {
    return falha([`Organização ${p.orgId} não está ativa (status: ${org.status}). Recusado.`]);
  }
  linhas.push(`Organização ${p.orgId} existe e está ativa.`);

  const atual = await deps.pastaAtualDaOrg(p.orgId);
  if (atual !== null && atual !== pastaId) {
    return falha([...linhas, `A org já usa a pasta ${atual}; desabilite e migre os canais antes de trocar. Recusado.`]);
  }

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

  const lida = lerResposta(resposta);
  if (!lida) {
    return falha([...linhas, "A resposta do FZAP não trouxe folder.id e a lista users. Formato desconhecido: recusado."]);
  }
  if (lida.id !== pastaId) {
    return falha([...linhas, "O token pertence a outra pasta do FZAP que não a de --pasta. Recusado."]);
  }
  if (lida.users.some((i) => i.metadata?.organization_id && i.metadata.organization_id !== p.orgId)) {
    return falha([...linhas, "A pasta tem instância de OUTRA organização. Recusado."]);
  }
  if (lida.users.some((i) => i.metadata?.sistema !== "crm")) {
    return falha([...linhas, "A pasta tem instância que não é do CRM (sem metadata.sistema=crm). Recusado."]);
  }
  linhas.push("Pasta validada no FZAP (200, id confere).");

  const dono = await deps.donoDaPasta(pastaId);
  if (dono !== null && dono !== p.orgId) {
    return falha([...linhas, `A pasta ${pastaId} já pertence a OUTRA organização (${dono}). Recusado.`]);
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
  await deps.gravar(p.orgId, pastaId, cifrado);
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
