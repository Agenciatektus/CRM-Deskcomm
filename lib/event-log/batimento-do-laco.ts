/**
 * O BATIMENTO do laço de event_log do worker — quem decide se o cron drena.
 *
 * ─── O problema ──────────────────────────────────────────────────────────────
 *
 * Os handlers do `event_log` tinham dois donos ao mesmo tempo: o laço do worker
 * (`drain-loop.ts`, a cada 2-10 s) e o cron `event-log-drain` (1×/min, "rede de
 * segurança"). Em paralelo é correto (claim CAS por linha), mas não é de graça:
 * cada tick do cron refaz a varredura de presos, o select do lote e um claim
 * por linha, competindo pelas mesmas linhas que o worker já está levando. O
 * plano Postgres-Elite de 2026-10-01 (item 6 do Caio, §2.4 do Nuno) mediu
 * quatro processos sobre o `event_log` e pediu UM dono.
 *
 * ─── O desenho ───────────────────────────────────────────────────────────────
 *
 * O worker é o dono. Depois de cada tick que TERMINOU (sem exceção), o laço
 * grava `Date.now()` numa chave do Redis do compose — no máximo uma escrita a
 * cada `INTERVALO_DO_BATIMENTO_MS`. O cron lê a chave antes de drenar: batimento
 * com menos de `BATIMENTO_VELHO_MS` → o worker está drenando, o cron sai sem
 * tocar no banco.
 *
 * Por que Redis e não uma linha no Postgres: um "heartbeat" no banco é um UPDATE
 * a cada 15 s na mesma linha — churn, WAL e uma linha quente nova justamente na
 * frente que existe para tirar contenção do banco. O Redis já está no compose
 * (rate-limit e debounce usam o mesmo REST via `srh`), é efêmero de propósito, e
 * perder a chave tem o efeito certo (ver abaixo). E não pede migration.
 *
 * ─── Falha ABERTA, sempre na direção do cron drenar ──────────────────────────
 *
 * Toda dúvida vira "worker não está drenando", que é o comportamento de antes
 * desta mudança (os dois drenam, seguros pelo CAS):
 *   - Redis sem configuração / malformado      → sem armazém → cron drena;
 *   - Redis inalcançável ou lento (> 2 s)      → leitura `null` → cron drena;
 *   - Redis reiniciou e perdeu a chave         → `null` → cron drena até o
 *     próximo batimento (≤ 15 s depois de o worker voltar a bater);
 *   - laço do worker não carregou (#648)       → nunca bate → cron drena;
 *   - worker morto                             → batimento envelhece → cron
 *     assume em ≤ BATIMENTO_VELHO_MS + 1 tick do cron (≈ 2-3 min).
 *
 * O módulo NÃO importa `@/lib/env` de propósito: o worker o carrega no boot e a
 * validação de `lib/env.ts` lança no topo do módulo (ver `drain-loop.ts`).
 */
import { Redis } from "@upstash/redis";

import { validarConfigRedisRest } from "@/lib/redis-config";

/** A chave do batimento. Uma por instalação: o Redis é do compose. */
export const CHAVE_DO_BATIMENTO = "crm:event-log-drain:batimento";

/** Batimento mais velho que isto = o worker NÃO está drenando. */
export const BATIMENTO_VELHO_MS = 120_000;

/** O worker grava no máximo uma vez a cada isto. Folga de 8× sobre o "velho". */
export const INTERVALO_DO_BATIMENTO_MS = 15_000;

/** A chave some sozinha se ninguém bater — só para não deixar lixo no Redis. */
const TTL_DA_CHAVE_S = 600;

/** Teto nosso para a ida ao Redis (o SDK sem isso pode não voltar). */
const TIMEOUT_MS = 2_000;

/** O que o batimento usa do Redis — mínimo, para o teste não precisar de rede. */
export interface ArmazemDoBatimento {
  get(chave: string): Promise<unknown>;
  set(chave: string, valor: string, opts: { ex: number }): Promise<unknown>;
}

/**
 * O worker está drenando? Regra pura, sem relógio.
 *
 * Batimento no FUTURO além da tolerância também conta como velho: relógio
 * torto não pode calar o cron para sempre.
 */
export function workerEstaDrenando(
  ultimoBatimentoMs: number | null,
  agoraMs: number,
  velhoMs: number = BATIMENTO_VELHO_MS,
): boolean {
  if (ultimoBatimentoMs === null || !Number.isFinite(ultimoBatimentoMs)) return false;
  const idade = agoraMs - ultimoBatimentoMs;
  return idade < velhoMs && idade > -velhoMs;
}

/** O laço deve gravar agora? `null` = nunca gravou neste processo. */
export function batimentoEstaNaVez(
  ultimoEnvioMs: number | null,
  agoraMs: number,
  intervaloMs: number = INTERVALO_DO_BATIMENTO_MS,
): boolean {
  if (ultimoEnvioMs === null) return true;
  return agoraMs - ultimoEnvioMs >= intervaloMs;
}

function comTeto<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => {
      const t = setTimeout(() => rej(new Error("redis: tempo esgotado")), TIMEOUT_MS);
      // Não segura o processo vivo por causa do teto.
      if (typeof t === "object" && t && "unref" in t) t.unref();
    }),
  ]);
}

/** Grava o batimento. Nunca lança: falhar aqui só faz o cron drenar junto. */
export async function registrarBatimento(
  armazem: ArmazemDoBatimento,
  agoraMs: number,
): Promise<boolean> {
  try {
    await comTeto(armazem.set(CHAVE_DO_BATIMENTO, String(agoraMs), { ex: TTL_DA_CHAVE_S }));
    return true;
  } catch {
    return false;
  }
}

/** Lê o batimento. Qualquer falha ou valor estranho → `null` (= cron drena). */
export async function lerBatimento(armazem: ArmazemDoBatimento): Promise<number | null> {
  try {
    const bruto = await comTeto(armazem.get(CHAVE_DO_BATIMENTO));
    if (bruto === null || bruto === undefined) return null;
    const n = Number(bruto);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * O cliente REST do Redis do compose, ou `null` se a configuração não serve.
 * `retry: false`: com o Redis fora, retentar só atrasa a decisão que o
 * fallback já toma (drenar).
 */
export function criarArmazemDoBatimento(
  ambiente: NodeJS.ProcessEnv = process.env,
): ArmazemDoBatimento | null {
  const url = ambiente.UPSTASH_REDIS_REST_URL;
  const token = ambiente.UPSTASH_REDIS_REST_TOKEN;
  if (!validarConfigRedisRest(url, token).ok) return null;
  return new Redis({ url: url!, token: token!, retry: false });
}
