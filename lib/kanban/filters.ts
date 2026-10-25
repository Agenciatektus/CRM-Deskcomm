import type { Lead } from "@/lib/types/leads";
import {
  ehPeriodo,
  estaAtrasado,
  estaParado,
  inicioDoPeriodo,
  origemDoLead,
  passaNaBusca,
  semProximoPasso,
  type PeriodoDeCriacao,
} from "@/lib/kanban/recorte-do-funil";
import { cardTemMarcador, cardTemTodasNaMesmaCaixa } from "@/lib/kanban/marcadores-do-card";
import {
  type ModoDeEtiqueta,
  marcadoresEscolhidos,
  modoDeEtiqueta,
} from "@/lib/inbox/marcador-da-conversa";

/**
 * Prefixo que marca um dono AGENTE no filtro (0070). O param de URL continua
 * sendo `owner=` — humano é o uuid puro, agente é `agent:<uuid>`, e o board
 * não precisa de dois seletores para a mesma pergunta ("de quem é isto?").
 */
export const AGENT_OWNER_PREFIX = "agent:";

export function agentOwnerFilter(agentId: string): string {
  return `${AGENT_OWNER_PREFIX}${agentId}`;
}

export function parseAgentOwnerFilter(value: string | undefined): string | null {
  if (!value?.startsWith(AGENT_OWNER_PREFIX)) return null;
  return value.slice(AGENT_OWNER_PREFIX.length) || null;
}

export interface LeadFilters {
  /** userId | `agent:<uuid>` | "any" | "unassigned" */
  owner?: string | "any" | "unassigned";
  status?: "all" | "open" | "won" | "lost";
  /**
   * A etiqueta escolhida, ou VÁRIAS (#1274).
   *
   * `string` continua aceito porque é o que o `filtersFromParams` entrega num
   * link salvo e o que qualquer chamada antiga manda. As DUAS formas passam pelo
   * MESMO normalizador (`marcadoresDoFiltro`), então "uma" nunca tem dois
   * sentidos — nem entre uma versão antiga do link e a de hoje.
   */
  tag?: string | readonly string[];
  /** E ou OU entre as etiquetas escolhidas (#1274). `e` é o padrão. */
  tagMode?: ModoDeEtiqueta;
  search?: string;
  /**
   * Limite de valor mínimo/máximo, em centavos (#1531).
   *
   * ⚠️ NÃO É COMPARÁVEL SOZINHO: ver `valueCurrency`. Guardar centavos sem
   * dizer a moeda é guardar metade da pergunta.
   */
  valueCentsMin?: number | null;
  valueCentsMax?: number | null;
  /**
   * A MOEDA EM QUE OS LIMITES DE VALOR FORAM ESCRITOS (#1531).
   *
   * Quem monta o filtro coloca aqui a da organização — é o padrão do issue.
   * Só dentro dela os centavos se comparam: `valueCentsMin` de 1.000,00 em real
   * não é pergunta nenhuma para um negócio de 5.000,00 € — responder exigiria
   * converter, e converter é o que a issue proíbe (o valor real só se conhece
   * no pagamento).
   *
   * Lead SEM moeda declarada (`currency` nulo, dado anterior à coluna) nasceu
   * na moeda da organização — e é nela que o limite nasce por padrão —, então
   * ele é comparável. Sem `valueCurrency`, nenhum lead é: o limite não responde
   * "fora do intervalo", ele não sabe nem qual é a pergunta.
   */
  valueCurrency?: string | null;
  /** Atalho "Atrasados": próximo passo vencido (a regra do card). */
  overdueOnly?: boolean;
  /** Atalho "Meus": responsável sou eu (`contexto.userId`). */
  meus?: boolean;
  /** Atalho "Sem próximo passo": nenhuma tarefa aberta. */
  semPasso?: boolean;
  /** Atalho "Parados": passou do limite da etapa (`expected_duration_hours`). */
  parados?: boolean;
  /** Canal de origem (`origemDoLead`), vários = OU. */
  canais?: readonly string[];
  /** Campanha de anúncio (`contact_campanha`), vários = OU. */
  campanhas?: readonly string[];
  /** Período de criação do negócio. */
  periodo?: PeriodoDeCriacao;
  /** O `lost_reason` exato do card — filtro de perda (issue #1537). */
  lostReason?: string;
  /** A categoria do motivo de perda (issue #1537), resolvida no funil. */
  lostCategory?: string;
}

/**
 * A lista de marcadores do filtro, sem vazio e sem repetido.
 *
 * Mora AQUI e não no `FilterBar` por uma razão que já custou defeito duas vezes
 * neste arquivo: quem MONTA o filtro e quem o APLICA precisam responder a mesma
 * pergunta. Com a regra escrita duas vezes, o seletor oferece uma combinação que
 * a lista nunca casa — sem erro, sem sintoma, só um filtro que devolve vazio.
 */
export function marcadoresDoFiltro(tag: LeadFilters["tag"]): string[] {
  if (tag == null) return [];
  const crus = typeof tag === "string" ? [tag] : tag;
  return marcadoresEscolhidos(crus);
}

/** A cor/ponto que o gatilho mostra: a primeira escolhida, ou nada. */
export function primeiroMarcador(tag: LeadFilters["tag"]): string | undefined {
  return marcadoresDoFiltro(tag)[0];
}

/**
 * Serializa/deserializa os filtros do board em query params (deep-linkável).
 * Os controles da barra do Funil: responsável, status (padrão Abertos), etiquetas,
 * busca, atalhos (meus, atrasados, sem próximo passo, parados), canal, período e valor.
 *
 * ⚠️ `getAll` no `tag` (#1274): a repetição na URL (`?tag=vip&tag=orçamento`) é o
 * que faz o link do funil com duas etiquetas sobreviver a um F5 e a um link
 * colado no chat. Um `get` leria a primeira e o deep-link mentiria sem aviso.
 * O `modo` só sai quando é `ou` — `e` é o padrão, e um `?tag=vip` de hoje não
 * ganha um `&modo=e` colado nele.
 */
export function filtersFromParams(
  sp: { get(key: string): string | null; getAll?: (key: string) => string[] },
): LeadFilters {
  const owner = sp.get("owner");
  const status = sp.get("status");
  // `getAll` não existe no tipo mínimo desta assinatura (o chamador real passa um
  // `URLSearchParams`), e o fallback de uma lista mantém o deep-link legível
  // quando um objeto de busca minimalista é passado em teste.
  const tags = typeof sp.getAll === "function" ? sp.getAll("tag") : [];
  const tag = tags.length > 0 ? tags : sp.get("tag") ?? undefined;
  const search = sp.get("q");
  const modo = sp.get("modo") ?? undefined;
  const canais = typeof sp.getAll === "function" ? sp.getAll("canal") : [];
  const campanhas = typeof sp.getAll === "function" ? sp.getAll("campanha") : [];
  const reais = (k: string) => {
    const v = sp.get(k);
    const n = v === null || v === "" ? NaN : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
  };
  const periodo = sp.get("periodo");
  return {
    owner: owner ?? undefined,
    // PADRÃO "Abertos" (barra aprovada em 13/10/2026): sem `status` na URL é
    // aberto; "Todos" vai explícito (`status=all`).
    status: status === "won" || status === "lost" || status === "all" ? status : "open",
    tag: tag ?? undefined,
    // Um `modo` fora dos dois vira `e`, e não erro: a URL é deep-link e não
    // resposta de API. O `z.enum` do servidor recusa (422) porque ali o
    // integrador precisa corrigir; aqui a tela não pode quebrar por um parâmetro
    // colado à mão.
    ...(modoDeEtiqueta(modo) ? { tagMode: modoDeEtiqueta(modo) } : {}),
    search: search ?? undefined,
    overdueOnly: sp.get("overdue") === "1" || undefined,
    meus: sp.get("meus") === "1" || undefined,
    semPasso: sp.get("sem_passo") === "1" || undefined,
    parados: sp.get("parados") === "1" || undefined,
    ...(canais.length > 0 ? { canais } : {}),
    ...(campanhas.length > 0 ? { campanhas } : {}),
    ...(ehPeriodo(periodo) ? { periodo } : {}),
    ...(reais("vmin") !== undefined ? { valueCentsMin: reais("vmin") } : {}),
    ...(reais("vmax") !== undefined ? { valueCentsMax: reais("vmax") } : {}),
    lostReason: sp.get("motivo") ?? undefined,
    lostCategory: sp.get("categoria") ?? undefined,
  };
}

export function filtersToParams(f: LeadFilters): string {
  const p = new URLSearchParams();
  if (f.owner && f.owner !== "any") p.set("owner", f.owner);
  if (f.status && f.status !== "open") p.set("status", f.status);
  // `append`, e não `set`: o último venceria, e o filtro de duas etiquetas
  // viraria uma só — a tela mostraria duas escolhidas filtrando por uma.
  for (const marcador of marcadoresDoFiltro(f.tag)) p.append("tag", marcador);
  if (f.tagMode === "ou") p.set("modo", "ou");
  if (f.search?.trim()) p.set("q", f.search.trim());
  if (f.overdueOnly) p.set("overdue", "1");
  if (f.meus) p.set("meus", "1");
  if (f.semPasso) p.set("sem_passo", "1");
  if (f.parados) p.set("parados", "1");
  for (const canal of f.canais ?? []) p.append("canal", canal);
  for (const campanha of f.campanhas ?? []) p.append("campanha", campanha);
  if (f.periodo) p.set("periodo", f.periodo);
  if (typeof f.valueCentsMin === "number") p.set("vmin", String(f.valueCentsMin / 100));
  if (typeof f.valueCentsMax === "number") p.set("vmax", String(f.valueCentsMax / 100));
  if (f.lostReason) p.set("motivo", f.lostReason);
  if (f.lostCategory) p.set("categoria", f.lostCategory);
  return p.toString();
}

/**
 * `contexto` é o que a tela sabe e o lead não: a categoria NÃO é coluna, ela
 * sai do `settings.lost_reasons` do funil (`lib/leads/motivos-de-perda-do-funil.ts`).
 * Sem contexto, filtrar por categoria não acha nada — que é o comportamento
 * honesto: sem configuração não há o que agrupar.
 */
export interface ContextoDosFiltros {
  categoriaDo?: (motivo: string) => string | undefined;
  /** Quem olha: o atalho "Meus". Sem ele, "Meus" não acha nada (honesto). */
  userId?: string;
  /** `crm_stages.expected_duration_hours` por etapa: o atalho "Parados". */
  limiteDaEtapa?: (stageId: string) => number | null | undefined;
  agora?: Date;
}

export function applyFilters(
  leads: Lead[],
  f: LeadFilters,
  contexto?: ContextoDosFiltros,
): Lead[] {
  const agora = contexto?.agora ?? new Date();
  const search = f.search ?? "";
  const desde = f.periodo ? inicioDoPeriodo(f.periodo, agora).getTime() : null;
  const canais = f.canais && f.canais.length > 0 ? new Set(f.canais) : null;
  const campanhas = f.campanhas && f.campanhas.length > 0 ? new Set(f.campanhas) : null;
  // Fora do `filter`: a escolha de E/OU é do filtro, não do card, e calculá-la a
  // cada linha pagaria uma normalização por card — a lista do funil é pequena
  // hoje e não precisa de um laço que cresce com ela.
  const marcadores = marcadoresDoFiltro(f.tag);
  // ⚠️ E/OU (#1274). O funil filtra no CLIENTE, então não há `cs`/`ov` para
  // delegar: a semântica é reimplementada aqui, e ela tem de ser a MESMA que a do
  // servidor (`lib/inbox/marcador-da-conversa.ts`).
  //
  // E o detalhe que é fácil errar: no servidor o E é `tags.cs.{a,b}` OU
  // `tags_do_contato.cs.{a,b}` — as DUAS etiquetas NA MESMA CAIXA, e as caixas em
  // disjunção. Portanto o E aqui é `cardTemTodasNaMesmaCaixa`, que pergunta caixa
  // por caixa, e o OU entre caixas é o de fora. Um `every` sobre a união das três
  // caixas (o que `cardTemMarcador` devolve) aceitaria "vip na conversa E
  // orçamento no contato" — que é justamente o caso que a issue registra como
  // decisão de produto pendente, e que o servidor NÃO aceita. Aceitar aqui e não
  // lá faria o mesmo filtro dar resultados diferentes em cada lista.
  const passaMarcador = (lead: Lead): boolean => {
    if (marcadores.length === 0) return true;
    if (f.tagMode === "ou") return marcadores.some((m) => cardTemMarcador(lead, m));
    return cardTemTodasNaMesmaCaixa(lead, marcadores);
  };

  return leads.filter((l) => {
    // "Sem responsável" é sem dono NENHUM — lead de dono agente tem dono.
    if (
      f.owner === "unassigned" &&
      (l.owner_user_id !== null || l.owner_agent_id !== null)
    )
      return false;
    if (f.owner && f.owner !== "any" && f.owner !== "unassigned") {
      const agentId = parseAgentOwnerFilter(f.owner);
      if (agentId) {
        if (l.owner_agent_id !== agentId) return false;
      } else if (l.owner_user_id !== f.owner) {
        return false;
      }
    }
    if (f.status && f.status !== "all" && l.status !== f.status) return false;
    // Motivo/categoria só existem em negócio PERDIDO (issue #1537). Escolher um
    // deles é pedir perdas: sem isso, o filtro combinado com a aba "Ganhos"
    // devolvia lista vazia sem dizer por quê.
    if ((f.lostReason || f.lostCategory) && l.status !== "lost") return false;
    if (f.lostReason && l.lost_reason !== f.lostReason) return false;
    if (f.lostCategory) {
      const motivo = l.lost_reason?.trim() ?? "";
      const categoria = motivo ? contexto?.categoriaDo?.(motivo) : undefined;
      if (categoria !== f.lostCategory) return false;
    }
    // As TRÊS caixas de marcador (negócio, contato e conversa) — ver
    // lib/kanban/marcadores-do-card.ts. Só `l.tags` deixava o marcador escrito
    // no contato ou na conversa sem casar card nenhum. O E/OU mora em
    // `passaMarcador`, lá em cima.
    if (!passaMarcador(l)) return false;
    if (search && !passaNaBusca(l, search)) return false;
    // O LIMITE DE VALOR SÓ SE COMPARA COM A MOEDA EM QUE FOI ESCRITO (upstream #1531).
    // Um negócio de 5.000,00 € não "passa" nem "reprova" um mínimo de
    // 1.000,00 R$: responder exigiria converter, e converter é o que a issue
    // proíbe. Lead sem moeda declarada é da moeda da organização (regra em
    // `valueCurrency`), e é nela que o limite nasce por padrão.
    if (typeof f.valueCentsMin === "number" || typeof f.valueCentsMax === "number") {
      const moedaDoLimite = f.valueCurrency ?? null;
      const moedaDoLead = l.currency ?? moedaDoLimite;
      if (moedaDoLimite === null || moedaDoLead !== moedaDoLimite) return false;
      const valor = l.value_cents ?? 0;
      if (typeof f.valueCentsMin === "number" && valor < f.valueCentsMin) return false;
      if (typeof f.valueCentsMax === "number" && valor > f.valueCentsMax) return false;
    }
    if (f.overdueOnly && !estaAtrasado(l, agora)) return false;
    if (f.meus && (!contexto?.userId || l.owner_user_id !== contexto.userId)) return false;
    if (f.semPasso && !semProximoPasso(l)) return false;
    if (f.parados && !estaParado(l, contexto?.limiteDaEtapa ?? (() => null), agora)) return false;
    if (canais && !canais.has(origemDoLead(l))) return false;
    if (campanhas && !campanhas.has(l.contact_campanha ?? "")) return false;
    if (desde !== null && new Date(l.created_at).getTime() < desde) return false;
    return true;
  });
}
