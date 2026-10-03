/**
 * Pool do Postgres do harness (SQL cru tipado, sem ORM — stack.md §1/§3).
 * A URL vem do env (SUPABASE_DB_URL), nunca hardcoded.
 *
 * Backend morrendo (blip/restart do Postgres) emite 'error' sem handler e
 * derruba o processo — pitfall canônico do pg, em DUAS formas:
 *   1. cliente OCIOSO no pool → o Pool re-emite 'error' (doc do pg-pool);
 *   2. cliente EM CHECKOUT sem query ativa (ex.: entre BEGIN e a próxima query
 *      de uma transação) → o 'error' sai no próprio Client, que fica SEM
 *      listener (pg-pool remove o idleListener no acquire).
 * Por isso o seam anexa um listener POR CLIENTE (evento 'connect', 1x por
 * conexão nova, sobrevive a checkout/release) — ele cobre as duas formas e
 * loga estruturado; o pool se recupera sozinho criando conexões novas.
 * `onError` injetável mantém o log no logger do consumidor (main.ts passa o
 * seu); o default usa o logger estruturado de obs/ para que NENHUM consumidor
 * do seam (testes, scripts) fique exposto ao crash.
 */
import pg from 'pg';

import { createLogger } from '../obs/logger';

/**
 * Prazos de SESSÃO de toda conexão dos nossos pools (banco nano: max_connections
 * 60, acesso pelo Supavisor em modo session). Medido em 30/09/2026: transações
 * ociosas somaram 13,4 h em ~3 dias, e a queda daquele dia teve 42
 * ECHECKOUTTIMEOUT no Supavisor. Sem teto, uma conexão presa segura um slot do
 * pooler indefinidamente.
 *
 * Quem PRECISA de espera longa por desenho (lock consultivo que serializa o envio
 * do número com throttle de até minutos, ou a reserva do canal que atravessa a
 * publicação HTTP) troca pelos prazos de espera longa, que também têm teto:
 * `semPrazoNaTransacao` / `semPrazoNaSessao` + `restaurarPrazosDaSessao`.
 */
export const PRAZOS_DA_SESSAO = {
  statement_timeout: '30s',
  idle_in_transaction_session_timeout: '60s',
  lock_timeout: '5s',
} as const;

/**
 * Aplicado por SET na conexão nova (evento `connect`), e não pelo `options` do
 * startup packet: o acesso é pelo Supavisor, e pooler (PgBouncer/Supavisor)
 * pode recusar ou descartar `options` no startup — um SET é aceito por qualquer
 * um, e em modo session ele vale pela vida da conexão.
 */
export const SQL_PRAZOS_DA_SESSAO = Object.entries(PRAZOS_DA_SESSAO)
  .map(([k, v]) => `set ${k} = '${v}'`)
  .join('; ');

/**
 * Conexão ociosa vive 5 min (era o default de 10 s do pg). Com polling de 2 s,
 * 10 s fazia o pool fechar e reabrir conexão o tempo todo: medido ~17,5 mil
 * `pgbouncer.get_auth` (54 ms) e ~14,8 mil `DISCARD ALL` (100 ms) em ~3 dias.
 */
export const IDLE_TIMEOUT_MS = 300_000;
/** Sem vaga no pool/pooler em 5 s, falha visível em vez de fila infinita. */
export const CONNECTION_TIMEOUT_MS = 5_000;

export type CreatePoolOptions = {
  /** `application_name` no pg_stat_activity — um por pool/processo. */
  applicationName?: string;
};

/** Nome que aparece em pg_stat_activity: `crm-<papel>` + pid, curto (limite 63). */
export function nomeDaAplicacao(papel: string): string {
  return `crm-${papel}-${process.pid}`.slice(0, 63);
}

/**
 * Prazos de quem espera POR DESENHO. Generosos, mas com teto: zerar tudo deixava
 * um processo pendurado (a chamada ao LLM não tem teto próprio) segurando a
 * conexão e o lock do número para sempre, com os outros workers esperando sem
 * limite.
 *
 * - idle_in_transaction 25 min: o maior trecho OCIOSO da transação do envio é o
 *   sono do pacing, `throttle_ms + jitter`, e os dois knobs vão até
 *   `KNOB_BOUNDS.intervalMaxMs` (10 min cada) = 20 min. Mais 5 min de folga
 *   para LLM + envio HTTP (o adapter de envio corta em 15 s).
 * - lock 30 min: quem espera o lock do número espera a transação inteira de quem
 *   o segura, que morre no teto de ociosa acima; 30 min cobre esse teto com
 *   folga sem virar espera infinita.
 * - statement 0: o lock é a única instrução longa e já tem o teto acima.
 */
export const PRAZOS_DA_ESPERA_LONGA = {
  statement_timeout: '0',
  idle_in_transaction_session_timeout: '25min',
  lock_timeout: '30min',
} as const;

/**
 * Clients de pool em modo TRANSACTION do pooler (porta 6543 / pgbouncer=true):
 * ali o backend é trocado a cada transação, e SET de sessão vazaria para a
 * sessão de outro cliente. Para estes, nada de SET de sessão.
 */
const clientesSemSessaoPropria = new WeakSet<object>();

/** URL que aponta para o pooler em modo transaction (Supavisor 6543 ou pgbouncer=true). */
export function ehPoolerEmModoTransacao(databaseUrl: string): boolean {
  try {
    const u = new URL(databaseUrl);
    return u.port === '6543' || u.searchParams.get('pgbouncer') === 'true';
  } catch {
    return false;
  }
}

/**
 * Troca os prazos SÓ nesta transação (`set_config(..., true)` = SET LOCAL, seguro
 * também em modo transaction) pelos de espera longa. Chamar logo depois do
 * `begin`, antes do lock que pode esperar.
 */
export async function semPrazoNaTransacao(client: pg.ClientBase): Promise<void> {
  const p = PRAZOS_DA_ESPERA_LONGA;
  await client.query(
    `select set_config('lock_timeout', '${p.lock_timeout}', true),
            set_config('statement_timeout', '${p.statement_timeout}', true),
            set_config('idle_in_transaction_session_timeout', '${p.idle_in_transaction_session_timeout}', true)`,
  );
}

/**
 * Prazos de espera longa na SESSÃO (lock consultivo fora de transação). No-op em
 * modo transaction do pooler: ali o SET cairia na sessão de outro cliente.
 */
export async function semPrazoNaSessao(client: pg.ClientBase): Promise<void> {
  if (clientesSemSessaoPropria.has(client)) return;
  const p = PRAZOS_DA_ESPERA_LONGA;
  await client.query(
    `select set_config('lock_timeout', '${p.lock_timeout}', false),
            set_config('statement_timeout', '${p.statement_timeout}', false)`,
  );
}

/** Volta aos prazos padrão antes de devolver o client ao pool (no-op em modo transaction). */
export async function restaurarPrazosDaSessao(client: pg.ClientBase): Promise<void> {
  if (clientesSemSessaoPropria.has(client)) return;
  await client.query(SQL_PRAZOS_DA_SESSAO);
}

export function createPool(
  databaseUrl: string,
  onError?: (err: Error) => void,
  opts: CreatePoolOptions = {},
): pg.Pool {
  // Knob opcional DB_POOL_MAX (env.ts Zod): teto de conexões por pool. Sem ele, o
  // pg decide (default 10). No banco nano (max_connections 60) o recomendado é
  // worker 5 e app 3 — ver .env.example. Os testes rodam em paralelo (N
  // pools × maxForks), então setam um teto baixo para não estourar max_connections
  // do servidor (invariante do vitest.config.ts). PII fora daqui: só o número.
  const raw = process.env.DB_POOL_MAX;
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  const max = Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    application_name: opts.applicationName ?? nomeDaAplicacao('pool'),
  });
  const handler =
    onError ??
    ((err: Error): void => {
      // mesma disciplina de errMsg do main.ts: 1ª linha truncada, PII fora
      const error = (err.message.split('\n', 1)[0] ?? '').slice(0, 300);
      createLogger().error('pool: conexão caiu — recria no próximo uso', { error });
    });
  // Os prazos são SET de SESSÃO: só valem com o pooler em modo session (5432).
  // Em modo transaction (6543) o SET vazaria para o backend de outro cliente —
  // então não aplica, e grita no log: a instalação está fora do desenho.
  const modoTransacao = ehPoolerEmModoTransacao(databaseUrl);
  if (modoTransacao) {
    createLogger().error(
      'pool: SUPABASE_DB_URL aponta para o pooler em modo transaction (porta 6543/pgbouncer=true); ' +
        'prazos de sessão NÃO aplicados — use a porta 5432 (modo session)',
      { application_name: opts.applicationName ?? nomeDaAplicacao('pool') },
    );
  }
  pool.on('connect', (client) => {
    client.on('error', handler);
    if (modoTransacao) {
      clientesSemSessaoPropria.add(client);
      return;
    }
    // Enfileirado ANTES da 1ª query de quem pediu a conexão (o pg executa em
    // ordem por client). Falhar aqui não derruba nada: a conexão segue com os
    // defaults do papel e a falha vai para o log.
    client.query(SQL_PRAZOS_DA_SESSAO).catch((err: unknown) => {
      handler(err instanceof Error ? err : new Error(String(err)));
    });
  });
  // Guarda contra crash na re-emissão do Pool (forma 1). NÃO loga: o mesmo erro
  // já passou pelo listener por-cliente acima (o pg-pool só re-emite 'error' de
  // cliente ocioso, e o 'error' do Client dispara os dois listeners em ordem).
  pool.on('error', () => undefined);
  return pool;
}
