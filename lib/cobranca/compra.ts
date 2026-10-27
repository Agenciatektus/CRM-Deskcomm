/**
 * O PROCESSADOR DA COMPRA POR LINK DE PAGAMENTO (venda direta, fatia 3).
 *
 * O webhook só grava o ponteiro (`cobranca_compras`, status `recebida`). Aqui a
 * compra é RELIDA na API do provedor (evento -> sessão de checkout): e-mail,
 * plano, nome da empresa e valor nunca vêm do corpo do aviso. Cada passo é
 * reentrante, e a rodada horária repassa o que ficou `recebida`,
 * `aguardando_pagamento` ou `falhou`.
 *
 * Plano, preço e intervalo moram no banco: o mapa `metadata.plano -> cobranca_planos.id`
 * é a chave `VENDA_DIRETA_PLANOS` de `platform_config` (JSON objeto). Ausente ou
 * inválido, toda compra fica `recusada` (`mapa_de_planos_ausente`).
 *
 * Ganchos para a fatia 3c (convite e aviso ao dono): `aoCriar` e `aoDuplicar`,
 * no-op por padrão. Falha neles só vira log: a empresa já existe.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { slugDoProvisionamento } from "@/lib/auth/provision";
import { logger } from "@/lib/logger";

import { adaptador as adaptadorDe, modoDoProvedor } from "./provedores";
import type { AdaptadorDeCobranca, CompraLida } from "./provedores/contrato";
import { sincronizar, type DependenciasDaCobranca } from "./sincronizar";
import type { Modo } from "./vocabulario";

export const CHAVE_DO_MAPA_DE_PLANOS = "VENDA_DIRETA_PLANOS";
export const LIMITE_DE_COMPRAS_POR_RODADA = 20;
export const TETO_DE_TENTATIVAS = 10;
const JANELA_DO_MESMO_EMAIL_MS = 24 * 3600 * 1000;
export const MOTIVO_DOS_EFEITOS_PENDENTES = "efeitos_pendentes";
const FORMATO_DO_CLIENT_REFERENCE = /^[A-Za-z0-9_-]{1,200}$/;

export interface CompraGravada {
  id: string;
  evento_id: string;
  status: string;
  organization_id: string | null;
  tentativas: number;
  email: string | null;
  nome_empresa: string | null;
  plano_chave: string | null;
}

export type MotivoDeDuplicada = "mesma_sessao" | "mesmo_email" | "cliente_ja_vinculado";

export interface DependenciasDaCompra {
  adaptador?: () => AdaptadorDeCobranca;
  modoDaChave?: () => Promise<Modo | null>;
  sincronizar?: typeof sincronizar;
  /** Repassado a `sincronizar` (adaptador, relógio, aviso). */
  cobranca?: DependenciasDaCobranca;
  agora?: () => Date;
  /** Gancho da 3c: empresa criada e sincronizada (convite e aviso ao dono). */
  aoCriar?: (org: string, compra: CompraGravada) => Promise<void> | void;
  /** Gancho da 3c: compra marcada como duplicada (alerta ao dono). */
  aoDuplicar?: (compra: CompraGravada, motivo: MotivoDeDuplicada) => Promise<void> | void;
}

export type ResultadoDaCompra =
  | { tipo: "inexistente" }
  | { tipo: "ja_resolvida"; status: string }
  | { tipo: "recusada"; motivo: string }
  | { tipo: "aguardando_pagamento" }
  | { tipo: "duplicada"; motivo: MotivoDeDuplicada }
  | { tipo: "criada"; org: string }
  | { tipo: "falhou" };

const TERMINAIS = new Set(["criada", "recusada", "duplicada"]);
const COLUNAS = "id, evento_id, status, organization_id, tentativas, email, nome_empresa, plano_chave";

/** `a***@dominio`: o e-mail nunca vai cru para o log. */
export function mascararEmail(email: string | null): string {
  if (!email) return "(sem e-mail)";
  const [local = "", dominio = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${dominio}`;
}

async function mapaDePlanos(admin: SupabaseClient): Promise<Record<string, string> | null> {
  const { data, error } = await admin.from("platform_config").select("valor").eq("chave", CHAVE_DO_MAPA_DE_PLANOS).maybeSingle();
  if (error) throw new Error(`compra: mapa de planos ilegível (${error.code ?? "sem_codigo"})`);
  const valor = (data as { valor: string | null } | null)?.valor;
  if (!valor) return null;
  try {
    const lido: unknown = JSON.parse(valor);
    if (lido === null || typeof lido !== "object" || Array.isArray(lido)) return null;
    const mapa: Record<string, string> = {};
    for (const [chave, id] of Object.entries(lido)) if (typeof id === "string" && id !== "") mapa[chave] = id;
    return Object.keys(mapa).length > 0 ? mapa : null;
  } catch {
    return null;
  }
}

/** UPDATE da compra. 23505 volta como código (quem chama decide); outro erro lança. */
async function gravar(admin: SupabaseClient, id: string, campos: Record<string, unknown>): Promise<string | null> {
  const { error } = await admin.from("cobranca_compras").update(campos).eq("id", id);
  if (error && error.code !== "23505") throw new Error(`compra: gravação falhou (${error.code ?? "sem_codigo"})`);
  return error?.code ?? null;
}

export async function processarCompra(
  admin: SupabaseClient,
  compraId: string,
  deps: DependenciasDaCompra = {},
): Promise<ResultadoDaCompra> {
  const agora = deps.agora ?? (() => new Date());
  const sincronizarOrg = deps.sincronizar ?? sincronizar;

  const { data: lida, error: erroDaLeitura } = await admin.from("cobranca_compras").select(COLUNAS).eq("id", compraId).maybeSingle();
  if (erroDaLeitura) throw new Error(`compra: leitura falhou (${erroDaLeitura.code ?? "sem_codigo"})`);
  const compra = lida as CompraGravada | null;
  if (!compra) return { tipo: "inexistente" };
  if (TERMINAIS.has(compra.status)) return { tipo: "ja_resolvida", status: compra.status };

  const recusar = async (motivo: string): Promise<ResultadoDaCompra> => {
    await gravar(admin, compra.id, { status: "recusada", motivo });
    logger.warn("cobranca.compra_recusada", { compra: compra.id, motivo });
    return { tipo: "recusada", motivo };
  };
  const falhar = async (erro: unknown): Promise<ResultadoDaCompra> => {
    logger.warn("cobranca.compra_falhou", {
      compra: compra.id,
      tentativas: compra.tentativas + 1,
      erro: erro instanceof Error ? erro.name : "desconhecido",
      codigo: (erro as { codigo?: string } | null)?.codigo ?? null,
    });
    try {
      await gravar(admin, compra.id, { status: "falhou", motivo: "erro_do_provedor", tentativas: compra.tentativas + 1 });
    } catch (e) {
      logger.error("cobranca.compra_falha_nao_gravada", { compra: compra.id, erro: e instanceof Error ? e.message : "desconhecido" });
    }
    return { tipo: "falhou" };
  };
  let atual: CompraGravada = compra;
  const duplicar = async (motivo: MotivoDeDuplicada): Promise<ResultadoDaCompra> => {
    await gravar(admin, compra.id, { status: "duplicada", motivo });
    logger.warn("cobranca.compra_duplicada", { compra: compra.id, motivo, email: mascararEmail(atual.email) });
    try {
      await deps.aoDuplicar?.(atual, motivo);
    } catch (e) {
      logger.error("cobranca.compra_ao_duplicar_falhou", { compra: compra.id, erro: e instanceof Error ? e.message : "desconhecido" });
    }
    return { tipo: "duplicada", motivo };
  };

  let relida: CompraLida;
  let modoDaChave: Modo | null;
  try {
    const provedor = (deps.adaptador ?? (() => adaptadorDe("stripe")))();
    if (!provedor.lerCompra) throw new Error("adaptador sem lerCompra");
    relida = await provedor.lerCompra(compra.evento_id);
    modoDaChave = await (deps.modoDaChave ?? (() => modoDoProvedor("stripe")))();
  } catch (e) {
    return falhar(e);
  }

  try {
    const email = relida.email?.trim().toLowerCase() || null;
    const nomeDaEmpresa = relida.nomeDaEmpresa?.trim() || null;
    const referencia = relida.clientReferenceId && FORMATO_DO_CLIENT_REFERENCE.test(relida.clientReferenceId) ? relida.clientReferenceId : null;
    atual = { ...compra, email, nome_empresa: nomeDaEmpresa, plano_chave: relida.planoChave };

    const codigo = await gravar(admin, compra.id, {
      sessao_id: relida.sessaoId,
      modo: relida.modo,
      email,
      nome_empresa: nomeDaEmpresa,
      plano_chave: relida.planoChave,
      client_reference_id: referencia,
    });
    if (codigo === "23505") return await duplicar("mesma_sessao");

    const mapa = await mapaDePlanos(admin);
    if (relida.modo !== modoDaChave) return await recusar("modo_divergente");
    if (relida.modoDaSessao !== "subscription" || !relida.assinaturaRef || !relida.clienteRef) {
      return await recusar("sessao_sem_assinatura");
    }
    if (mapa === null) return await recusar("mapa_de_planos_ausente");
    const planoId = relida.planoChave ? mapa[relida.planoChave] : undefined;
    if (planoId === undefined) return await recusar("plano_fora_do_mapa");

    const { data: plano, error: erroDoPlano } = await admin.from("cobranca_planos").select("id, intervalo").eq("id", planoId).maybeSingle();
    if (erroDoPlano) throw new Error(`compra: plano ilegível (${erroDoPlano.code ?? "sem_codigo"})`);
    const intervaloDoPlano = (plano as { intervalo: string } | null)?.intervalo;
    if (!intervaloDoPlano) return await recusar("plano_inexistente");
    const esperado = relida.intervaloDaAssinatura === "month" ? "mes" : relida.intervaloDaAssinatura === "year" ? "ano" : null;
    if (esperado !== intervaloDoPlano) return await recusar("intervalo_divergente");
    if (!nomeDaEmpresa) return await recusar("sem_nome_da_empresa");
    if (!email) return await recusar("sem_email");

    if (relida.pagamento !== "paid") {
      if (relida.status === "expired") return await recusar("sessao_expirada");
      await gravar(admin, compra.id, { status: "aguardando_pagamento", motivo: null });
      return { tipo: "aguardando_pagamento" };
    }

    const desde = new Date(agora().getTime() - JANELA_DO_MESMO_EMAIL_MS).toISOString();
    const { data: irmas, error: erroDasIrmas } = await admin
      .from("cobranca_compras")
      .select("id")
      .eq("email", email)
      .eq("status", "criada")
      .neq("id", compra.id)
      .gte("created_at", desde)
      .limit(1);
    if (erroDasIrmas) throw new Error(`compra: irmãs ilegíveis (${erroDasIrmas.code ?? "sem_codigo"})`);
    if (((irmas ?? []) as unknown[]).length > 0) return await duplicar("mesmo_email");

    const { data: org, error: erroDaRpc } = await admin.rpc("fn_cobranca_org_da_compra", {
      p_compra: compra.id,
      p_nome: nomeDaEmpresa,
      p_slug: slugDoProvisionamento("stripe", relida.sessaoId),
      p_plano: planoId,
      p_modo: relida.modo,
      p_cliente: relida.clienteRef,
      p_assinatura: relida.assinaturaRef,
    });
    if (erroDaRpc) {
      if (erroDaRpc.code === "23505") return await duplicar("cliente_ja_vinculado");
      if (erroDaRpc.code === "22023") return await recusar("slug_em_uso");
      if (erroDaRpc.code === "P0002") return { tipo: "inexistente" };
      throw new Error(`compra: criação da empresa falhou (${erroDaRpc.code ?? "sem_codigo"})`);
    }
    const orgId = org as string;

    const r = await sincronizarOrg(admin, orgId, deps.cobranca);
    if (r.tipo === "falhou") throw new Error(`compra: sincronização falhou (${r.erro})`);
    await gravar(admin, compra.id, { status: "criada", motivo: null, organization_id: orgId });
    logger.info("cobranca.compra_criada", { compra: compra.id, organization_id: orgId });
    try {
      await deps.aoCriar?.(orgId, { ...atual, status: "criada", organization_id: orgId });
    } catch (e) {
      logger.error("cobranca.compra_ao_criar_falhou", { compra: compra.id, erro: e instanceof Error ? e.message : "desconhecido" });
      // A empresa existe, o convite não saiu: a rodada repassa só o gancho (motivo `efeitos_pendentes`).
      try {
        await gravar(admin, compra.id, { motivo: MOTIVO_DOS_EFEITOS_PENDENTES, tentativas: compra.tentativas + 1 });
      } catch (g) {
        logger.error("cobranca.compra_efeitos_nao_marcados", { compra: compra.id, erro: g instanceof Error ? g.message : "desconhecido" });
      }
    }
    return { tipo: "criada", org: orgId };
  } catch (e) {
    return falhar(e);
  }
}

/** Repassa SÓ o gancho `aoCriar` de uma compra `criada` que ficou com os efeitos pendentes. Sem RPC, sem releitura. */
async function repetirEfeitos(admin: SupabaseClient, compraId: string, deps: DependenciasDaCompra): Promise<boolean> {
  const { data, error } = await admin
    .from("cobranca_compras")
    .select(COLUNAS)
    .eq("id", compraId)
    .eq("status", "criada")
    .eq("motivo", MOTIVO_DOS_EFEITOS_PENDENTES)
    .maybeSingle();
  if (error) throw new Error(`compra: leitura falhou (${error.code ?? "sem_codigo"})`);
  const compra = data as CompraGravada | null;
  if (!compra?.organization_id) return true;
  try {
    await deps.aoCriar?.(compra.organization_id, compra);
  } catch (e) {
    logger.error("cobranca.compra_ao_criar_falhou", { compra: compra.id, erro: e instanceof Error ? e.message : "desconhecido" });
    await gravar(admin, compra.id, { tentativas: compra.tentativas + 1 });
    return false;
  }
  await gravar(admin, compra.id, { motivo: null });
  return true;
}

export interface ResumoDasCompras {
  lidas: number;
  criadas: number;
  falhas: number;
}

/** A rodada: o que ficou pelo caminho, em ordem de chegada, no máximo 20 por vez. */
export async function processarComprasPendentes(admin: SupabaseClient, deps: DependenciasDaCompra = {}): Promise<ResumoDasCompras> {
  const { data, error } = await admin
    .from("cobranca_compras")
    .select("id")
    .in("status", ["recebida", "aguardando_pagamento", "falhou"])
    .lt("tentativas", TETO_DE_TENTATIVAS)
    .order("created_at", { ascending: true })
    .limit(LIMITE_DE_COMPRAS_POR_RODADA);
  if (error) throw new Error(`compra: fila ilegível (${error.code ?? "sem_codigo"})`);
  const resumo: ResumoDasCompras = { lidas: 0, criadas: 0, falhas: 0 };
  for (const { id } of (data ?? []) as Array<{ id: string }>) {
    resumo.lidas += 1;
    try {
      const r = await processarCompra(admin, id, deps);
      if (r.tipo === "criada") resumo.criadas += 1;
      if (r.tipo === "falhou") resumo.falhas += 1;
    } catch (e) {
      resumo.falhas += 1;
      logger.error("cobranca.compra_rodada_falhou", { compra: id, erro: e instanceof Error ? e.message : "desconhecido" });
    }
  }
  const { data: pendentes, error: erroDosEfeitos } = await admin
    .from("cobranca_compras")
    .select("id")
    .eq("status", "criada")
    .eq("motivo", MOTIVO_DOS_EFEITOS_PENDENTES)
    .lt("tentativas", TETO_DE_TENTATIVAS)
    .order("created_at", { ascending: true })
    .limit(LIMITE_DE_COMPRAS_POR_RODADA);
  if (erroDosEfeitos) throw new Error(`compra: fila de efeitos ilegível (${erroDosEfeitos.code ?? "sem_codigo"})`);
  for (const { id } of (pendentes ?? []) as Array<{ id: string }>) {
    resumo.lidas += 1;
    try {
      if (!(await repetirEfeitos(admin, id, deps))) resumo.falhas += 1;
    } catch (e) {
      resumo.falhas += 1;
      logger.error("cobranca.compra_rodada_falhou", { compra: id, erro: e instanceof Error ? e.message : "desconhecido" });
    }
  }
  return resumo;
}
