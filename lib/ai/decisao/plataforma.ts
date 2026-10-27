/**
 * PROTEÇÃO DO SALDO DA CHAVE DA PLATAFORMA: teto por empresa e disjuntor global.
 *
 * A chave `JEV_PLATFORM_API_KEY` paga o Jev de toda empresa elegível sem chave
 * própria, com UM saldo compartilhado. Duas travas, ambas só para essa chave
 * (quem usa a chave própria nunca passa por aqui):
 *
 *  - TETO MENSAL POR EMPRESA (`JEV_TETO_MENSAL_POR_EMPRESA_USD_CENTS`, padrão 50
 *    = US$ 0,50, em centavos de dólar como `teto_ia_usd_cents` do plano). O gasto
 *    sai de `jev_plataforma_uso` (migration 9078), gravado em `decidirNoPonto`
 *    (`./ponto.ts`), o único ponto por onde a chave da plataforma passa. Atingido,
 *    `destinoDasTarefas` devolve `null`: IA de sempre, sem erro, zero fetch, até
 *    virar o mês (UTC). A leitura tem cache curto por processo: sem consulta por
 *    mensagem.
 *
 *  - DISJUNTOR GLOBAL. Um 402 (`sem_credito`) ou 401 (`credencial_invalida`) com a
 *    chave da plataforma é a CONTA da instalação, não da empresa: abre para todas,
 *    sem esperar três falhas por empresa. O estado precisa valer entre processos
 *    (app e workers). Escolha: uma linha em `platform_config`
 *    (`JEV_PLATFORM_DISJUNTOR_ATE`, valor = instante ISO de reabertura), que é o
 *    que o repo já usa para estado da INSTALAÇÃO e funciona em self-host sem
 *    Redis (o Upstash é opcional e cai em memória por instância). Reabre por
 *    tempo: passado o instante, UM processo ganha a tentativa por um UPDATE
 *    condicional (meia-abertura); sucesso fecha, falha reabre por mais 15 minutos.
 *
 * ALERTA AO ADMIN DA PLATAFORMA: não existe canal de alerta da instalação para
 * este caso (a Central de avisos é por empresa, e a mensagem à empresa seria a
 * conta que ela não tem). Aqui sai um log estruturado de nível error, com nome
 * fixo para busca (`jev_plataforma_disjuntor_aberto`, `jev_plataforma_teto_atingido`),
 * e o próprio estado do disjuntor fica visível na linha de `platform_config`.
 * A chave da plataforma nunca entra em log.
 */
import * as Sentry from "@sentry/nextjs";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export const TETO_PADRAO_USD_CENTS = 50;
/** Preço desconhecido não vira zero: a chamada conta como isto, em centavos de dólar, para o teto. */
export const CUSTO_ESTIMADO_USD_CENTS = 0.1;
const CACHE_DO_GASTO_MS = 30_000;
const CACHE_DO_DISJUNTOR_MS = 15_000;
export const REABERTURA_MS = 15 * 60_000;
const TENTATIVA_MS = 60_000;
export const CHAVE_DO_DISJUNTOR = "JEV_PLATFORM_DISJUNTOR_ATE";

/** O teto, em centavos de dólar. Vazio, zero ou lixo = 50. */
export function tetoMensalPorEmpresaCents(): number {
  const n = Number((env.JEV_TETO_MENSAL_POR_EMPRESA_USD_CENTS ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : TETO_PADRAO_USD_CENTS;
}

const mesDe = (agora: number) => new Date(agora).toISOString().slice(0, 7);

// ── Teto por empresa ─────────────────────────────────────────────────────────
// ponytail: um Map por processo; cresce até o número de empresas elegíveis.
const gastos = new Map<string, { custo: number; mes: string; lidoEm: number }>();
const tetoJaAvisado = new Set<string>();

// ponytail: cache por processo, 15 s: o estado global custa uma leitura a cada
// 15 s por processo, não por mensagem.
let disjuntor: { estado: "fechado" | "aberto"; ate: number; lidoEm: number } | null = null;

/** Só para teste: zera o cache e os avisos deste processo. */
export function zerarEstadoDaPlataforma(): void {
  gastos.clear();
  tetoJaAvisado.clear();
  disjuntor = null;
}

/**
 * O alerta ao admin da plataforma, além do log: `Sentry.captureMessage` (o SDK que o
 * servidor já usa, ex.: `lib/lgpd/sla-alarm.ts`; sem `SENTRY_DSN` ele não envia nada).
 * Só nome do evento e números, nunca a chave. Nunca lança.
 */
function alertarNoSentry(evento: string, extras: Record<string, string | number>): void {
  try {
    Sentry.captureMessage(evento, { level: "error", tags: { evento }, extra: extras });
  } catch {
    // alerta é melhor-esforço
  }
}

function avisarTeto(organizationId: string, mes: string, custo: number): void {
  const marca = `${organizationId}:${mes}`;
  if (tetoJaAvisado.has(marca)) return;
  tetoJaAvisado.add(marca);
  logger.error("jev_plataforma_teto_atingido", {
    organizationId,
    mes,
    gastoUsdCents: custo,
    tetoUsdCents: tetoMensalPorEmpresaCents(),
  });
  alertarNoSentry("jev_plataforma_teto_atingido", {
    organizationId,
    mes,
    gastoUsdCents: custo,
    tetoUsdCents: tetoMensalPorEmpresaCents(),
  });
}

/** O pedaço do cliente admin que toca a tabela nova (ainda fora de `database.types.ts`). */
interface UsoAdmin {
  from(tabela: "jev_plataforma_uso"): {
    select(colunas: string): {
      eq(coluna: string, valor: string): {
        eq(coluna: string, valor: string): {
          maybeSingle(): Promise<{ data: { custo_usd_cents: number | string } | null; error: unknown }>;
        };
      };
    };
  };
  rpc(
    nome: "fn_jev_plataforma_registrar",
    args: { p_org: string; p_custo_cents: number },
  ): Promise<{ data: unknown; error: unknown }>;
}

/** A empresa já gastou o teto do mês com a chave da plataforma? Falha de leitura vale "sim" (protege o saldo). */
export async function tetoAtingido(admin: Admin, organizationId: string, agora: number = Date.now()): Promise<boolean> {
  const mes = mesDe(agora);
  const guardado = gastos.get(organizationId);
  let custo: number;
  if (guardado && guardado.mes === mes && agora - guardado.lidoEm < CACHE_DO_GASTO_MS) {
    custo = guardado.custo;
  } else {
    try {
      const { data, error } = await (admin as unknown as UsoAdmin)
        .from("jev_plataforma_uso")
        .select("custo_usd_cents")
        .eq("organization_id", organizationId)
        .eq("mes", `${mes}-01`)
        .maybeSingle();
      if (error) throw error;
      custo = Number(data?.custo_usd_cents ?? 0);
      gastos.set(organizationId, { custo, mes, lidoEm: agora });
    } catch (erro) {
      logger.warn("gasto do Jev da plataforma não pôde ser lido; empresa fica só com a IA de sempre", {
        organizationId,
        erro: erro instanceof Error ? erro.name : typeof erro,
      });
      return true;
    }
  }
  const atingido = custo >= tetoMensalPorEmpresaCents();
  if (atingido) avisarTeto(organizationId, mes, custo);
  return atingido;
}

/** Soma o custo de uma chamada feita com a chave da plataforma. Nunca lança. */
export async function registrarUsoDaPlataforma(
  admin: Admin,
  organizationId: string,
  custoUsdCents: number | null,
  agora: number = Date.now(),
): Promise<void> {
  // Sem preço, sem token ou NaN: a estimativa conservadora (NaN viraria null no JSON e gravaria 0).
  const custo = custoUsdCents !== null && Number.isFinite(custoUsdCents) && custoUsdCents >= 0 ? custoUsdCents : CUSTO_ESTIMADO_USD_CENTS;
  try {
    const { data, error } = await (admin as unknown as UsoAdmin).rpc("fn_jev_plataforma_registrar", {
      p_org: organizationId,
      p_custo_cents: custo,
    });
    if (error) throw error;
    const total = Number(data);
    if (Number.isFinite(total)) {
      gastos.set(organizationId, { custo: total, mes: mesDe(agora), lidoEm: agora });
      if (total >= tetoMensalPorEmpresaCents()) avisarTeto(organizationId, mesDe(agora), total);
    }
  } catch (erro) {
    logger.warn("gasto do Jev da plataforma não foi gravado", {
      organizationId,
      erro: erro instanceof Error ? erro.name : typeof erro,
    });
  }
}

// ── Disjuntor global ─────────────────────────────────────────────────────────
export type EstadoDoDisjuntorGlobal = "fechado" | "aberto" | "tentativa";

/** Quem ganha a tentativa (meia-abertura) recebe `tentativa`; os demais seguem `aberto`. */
export async function estadoDoDisjuntorGlobal(admin: Admin, agora: number = Date.now()): Promise<EstadoDoDisjuntorGlobal> {
  if (
    disjuntor &&
    agora - disjuntor.lidoEm < CACHE_DO_DISJUNTOR_MS &&
    (disjuntor.estado === "fechado" || agora < disjuntor.ate)
  ) {
    return disjuntor.estado;
  }
  try {
    const { data, error } = await admin
      .from("platform_config")
      .select("valor")
      .eq("chave", CHAVE_DO_DISJUNTOR)
      .maybeSingle();
    if (error) throw error;
    const valor = typeof data?.valor === "string" ? data.valor : null;
    const ate = valor === null ? NaN : Date.parse(valor);
    if (valor === null || !Number.isFinite(ate)) {
      disjuntor = { estado: "fechado", ate: 0, lidoEm: agora };
      return "fechado";
    }
    if (agora < ate) {
      disjuntor = { estado: "aberto", ate, lidoEm: agora };
      return "aberto";
    }
    // Venceu: UM processo ganha a tentativa. O UPDATE só acerta se o valor ainda é o que lemos.
    const { data: ganhou, error: erroDaDisputa } = await admin
      .from("platform_config")
      .update({ valor: new Date(agora + TENTATIVA_MS).toISOString() })
      .eq("chave", CHAVE_DO_DISJUNTOR)
      .eq("valor", valor)
      .select("chave")
      .maybeSingle();
    if (erroDaDisputa) throw erroDaDisputa;
    disjuntor = { estado: "aberto", ate: agora + TENTATIVA_MS, lidoEm: agora };
    return ganhou ? "tentativa" : "aberto";
  } catch (erro) {
    // Sem saber o estado, o saldo compartilhado não é arriscado: tratado como aberto por pouco tempo.
    logger.warn("estado do disjuntor do Jev da plataforma não pôde ser lido; tratado como aberto", {
      erro: erro instanceof Error ? erro.name : typeof erro,
    });
    disjuntor = { estado: "aberto", ate: agora + CACHE_DO_DISJUNTOR_MS, lidoEm: agora };
    return "aberto";
  }
}

/** Abre para todas as empresas, em todos os processos, por `REABERTURA_MS`. Nunca lança. */
export async function abrirDisjuntorGlobal(
  admin: Admin,
  motivo: "sem_credito" | "credencial_invalida",
  agora: number = Date.now(),
): Promise<void> {
  const jaAberto = disjuntor?.estado === "aberto" && disjuntor.ate - agora > TENTATIVA_MS;
  const ate = agora + REABERTURA_MS;
  disjuntor = { estado: "aberto", ate, lidoEm: agora };
  try {
    const { error } = await admin
      .from("platform_config")
      .upsert(
        { chave: CHAVE_DO_DISJUNTOR, valor: new Date(ate).toISOString(), eh_segredo: false, semeado_do_env: false },
        { onConflict: "chave" },
      );
    if (error) throw error;
  } catch (erro) {
    logger.warn("o disjuntor do Jev da plataforma abriu só neste processo (a gravação falhou)", {
      erro: erro instanceof Error ? erro.name : typeof erro,
    });
  }
  if (!jaAberto) {
    // O aviso ao admin da plataforma (ver o cabeçalho): log estruturado, sem a chave.
    logger.error("jev_plataforma_disjuntor_aberto", { motivo, reabreEm: new Date(ate).toISOString() });
    alertarNoSentry("jev_plataforma_disjuntor_aberto", { motivo, reabreEm: new Date(ate).toISOString() });
  }
}

/** A tentativa deu certo: fecha para todos. Nunca lança. */
export async function fecharDisjuntorGlobal(admin: Admin, agora: number = Date.now()): Promise<void> {
  disjuntor = { estado: "fechado", ate: 0, lidoEm: agora };
  try {
    const { error } = await admin.from("platform_config").delete().eq("chave", CHAVE_DO_DISJUNTOR);
    if (error) throw error;
    logger.info("jev_plataforma_disjuntor_fechado", {});
  } catch (erro) {
    logger.warn("o disjuntor do Jev da plataforma não foi fechado no banco", {
      erro: erro instanceof Error ? erro.name : typeof erro,
    });
  }
}
