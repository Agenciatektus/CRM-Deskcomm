import { z } from "zod";

/**
 * Os filtros de atendimento da Inbox (migration 9051): FUNIL, ETAPAS, RESPONSÁVEL e
 * PERÍODO da última mensagem. Um lugar só para a forma dos quatro, porque a lista
 * (`GET /api/v1/conversations`) e a contagem (`/counts`) têm de aplicar o MESMO
 * filtro: a segunda régua sempre diverge (#1223).
 */

/** O período da última mensagem: as janelas que a tela oferece. */
export const PERIODOS = ["24h", "7d", "30d"] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Rótulo de cada período: as chaves do dicionário (o espanhol mora lá). */
export const ROTULO_DO_PERIODO: Record<Periodo, string> = {
  "24h": "Últimas 24 h",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

const HORAS: Record<Periodo, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

/** Teto de etapas por pedido: um funil real tem uma dezena; isto só barra abuso na URL. */
export const MAXIMO_DE_ETAPAS = 30;

/** O responsável "ninguém" (sem atendente): `assigned_to_user_id is null`. */
export const SEM_RESPONSAVEL = "ninguem";

/**
 * O corte do período, calculado UMA vez por pedido. A lista aplica em
 * `last_message_at >=` e a contagem manda o mesmo valor em `p_desde`.
 */
export function inicioDoPeriodo(periodo: Periodo, agora: number = Date.now()): string {
  return new Date(agora - HORAS[periodo] * 3_600_000).toISOString();
}

const uuid = z.string().uuid();

/** As peças do schema da lista (e da leitura da contagem). */
export const camposDosFiltrosDoAtendimento = {
  /** O funil do negócio do contato da conversa (`funis_da_conversa`). */
  funil: uuid.optional(),
  /**
   * Etapas do funil (várias, `?etapa=a&etapa=b`, lidas por `getAll`). Lista vazia vira
   * `undefined` (sem filtro), pela mesma razão da `tag`: `[]` num `ov` não casa nada.
   */
  etapa: z
    .union([uuid, z.array(uuid).max(MAXIMO_DE_ETAPAS)])
    .transform((v) => {
      const lista = Array.isArray(v) ? v : [v];
      return lista.length > 0 ? lista : undefined;
    })
    .optional(),
  /** Quem atende: o id de um membro ou `ninguem`. */
  responsavel: z.union([uuid, z.literal(SEM_RESPONSAVEL)]).optional(),
  /** O período da última mensagem. */
  periodo: z.enum(PERIODOS).optional(),
};

const schemaDaContagem = z.object(camposDosFiltrosDoAtendimento);
export type FiltrosDoAtendimento = z.infer<typeof schemaDaContagem>;

/** Lê os quatro da URL, como a rota da lista lê. `null` = valor inválido (422). */
export function lerFiltrosDoAtendimento(sp: URLSearchParams): FiltrosDoAtendimento | null {
  const r = schemaDaContagem.safeParse({
    funil: sp.get("funil") ?? undefined,
    etapa: sp.getAll("etapa"),
    responsavel: sp.get("responsavel") ?? undefined,
    periodo: sp.get("periodo") ?? undefined,
  });
  return r.success ? r.data : null;
}

/** Os parâmetros da `fn_contagens_da_caixa` (9051) para os quatro filtros. */
export function parametrosDaContagem(f: FiltrosDoAtendimento, agora: number = Date.now()) {
  return {
    p_funil: f.funil ?? null,
    p_etapas: f.etapa ?? null,
    p_responsavel: f.responsavel ?? null,
    p_desde: f.periodo ? inicioDoPeriodo(f.periodo, agora) : null,
  };
}

/** O mínimo do builder do PostgREST que os quatro filtros usam. */
interface ConsultaFiltravel<Q> {
  eq(coluna: string, valor: string): Q;
  is(coluna: string, valor: null): Q;
  gte(coluna: string, valor: string): Q;
  filter(coluna: string, operador: string, valor: string): Q;
}

/**
 * Aplica os quatro na consulta da lista, com o MESMO predicado da contagem:
 * etapa escolhida decide sozinha (a etapa é de um funil só); sem etapa, vale o funil.
 * Campos calculados (`etapas_da_conversa`, `funis_da_conversa`), sem lista de ids na URL.
 */
export function aplicarFiltrosDoAtendimento<Q extends ConsultaFiltravel<Q>>(
  consulta: Q,
  f: FiltrosDoAtendimento,
  agora: number = Date.now(),
): Q {
  let q = consulta;
  if (f.etapa && f.etapa.length > 0) q = q.filter("etapas_da_conversa", "ov", `{${f.etapa.join(",")}}`);
  else if (f.funil) q = q.filter("funis_da_conversa", "cs", `{${f.funil}}`);
  if (f.responsavel === SEM_RESPONSAVEL) q = q.is("assigned_to_user_id", null);
  else if (f.responsavel) q = q.eq("assigned_to_user_id", f.responsavel);
  if (f.periodo) q = q.gte("last_message_at", inicioDoPeriodo(f.periodo, agora));
  return q;
}

/** O que a TELA guarda dos quatro (o mesmo nome nos dois hooks: lista e contagem). */
export interface EscolhaDoAtendimento {
  funil?: string;
  etapas?: readonly string[];
  responsavel?: string;
  periodo?: Periodo;
}

/**
 * Escreve os quatro na URL do pedido, igual na lista e na contagem: a mesma função
 * nos dois hooks impede o badge de contar um filtro que a lista não pediu. Etapa sai
 * por `append` (várias), e só com funil escolhido: sem funil a tela não oferece etapa.
 */
export function escreverFiltrosDoAtendimento(qs: URLSearchParams, f: EscolhaDoAtendimento): void {
  if (f.funil) {
    qs.set("funil", f.funil);
    for (const etapa of f.etapas ?? []) qs.append("etapa", etapa);
  }
  if (f.responsavel) qs.set("responsavel", f.responsavel);
  if (f.periodo) qs.set("periodo", f.periodo);
}

/**
 * A escolha que chega pela URL da Inbox (`?funil=&etapa=&responsavel=&periodo=`), o
 * mesmo deep-link do `?sem_passo=1`. Valor inválido some (a tela não quebra por link).
 */
export function escolhaDaUrl(sp: URLSearchParams): EscolhaDoAtendimento | undefined {
  const f = lerFiltrosDoAtendimento(sp);
  if (!f || (!f.funil && !f.responsavel && !f.periodo)) return undefined;
  return { funil: f.funil, etapas: f.funil ? f.etapa : undefined, responsavel: f.responsavel, periodo: f.periodo };
}
