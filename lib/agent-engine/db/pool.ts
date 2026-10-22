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

export const QUERY_TIMEOUT_MS = 60_000;
const KEEPALIVE_INITIAL_DELAY_MS = 10_000;
// Ociosa LONGA: o default do pg (10 s) com o polling de 2 s do worker fechava e
// reabria conexão sem parar — cada uma paga handshake, `get_auth` no pooler e
// `DISCARD ALL` na devolução (dezenas de milhares por dia, sem trabalho útil).
// 5 min mantém as conexões quentes entre os ciclos; conexão morta enquanto
// ociosa continua sendo detectada pelo keepAlive e descartada pelo listener.
export const IDLE_TIMEOUT_MS = 300_000;

/**
 * Quem abriu o pool. Vira o `application_name` da conexão
 * (`crm-<papel>-<pid>`), então `pg_stat_activity` mostra de qual processo
 * vem cada conexão, query lenta ou lock preso. O container do scheduler não
 * abre conexão (é crond + curl nas rotas do app); o laço de cron que roda
 * dentro do worker usa o pool do worker.
 */
export type PapelDoPool = 'worker' | 'app-request' | 'app-skills' | 'media-derive' | 'script';

export function nomeDaAplicacao(papel: PapelDoPool, pid: number = process.pid): string {
  return `crm-${papel}-${pid}`;
}

export function createPool(
  databaseUrl: string,
  onError?: (err: Error) => void,
  papel: PapelDoPool = 'script',
): pg.Pool {
  // Knob opcional DB_POOL_MAX (env.ts Zod): teto de conexões por pool. Sem ele, o
  // pg decide (default 10) — o caso de produção. Os testes rodam em paralelo (N
  // pools × maxForks), então setam um teto baixo para não estourar max_connections
  // do servidor (invariante do vitest.config.ts). PII fora daqui: só o número.
  const raw = process.env.DB_POOL_MAX;
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  const max = Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  // Socket MUDO (restart do Postgres/pooler sem FIN chegar) não emite 'error':
  // a query fica pendurada para sempre e quem a espera para junto — o laço do
  // drain da IA ficou dias parado assim com o healthz dizendo ok. O teto de
  // leitura faz a query falhar (o pool descarta o cliente) e o keepAlive faz o
  // SO perceber a conexão ociosa morta antes de ela ser reusada.
  // Sem `connectionTimeoutMillis` de propósito: no pg-pool ele também limita a
  // ESPERA NA FILA do pool cheio ('timeout exceeded when trying to connect'), e
  // aqui a fila é esperada no pico (before-send segura conexão durante lock,
  // throttle e envio; inbound-turn e get-lead-context contam com "espera, não
  // erro"). O socket mudo já é fechado pelas duas peças acima.
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    query_timeout: QUERY_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    // Se a URL já trouxer application_name, a URL vence (o pg mescla a string
    // de conexão por cima da config) — escolha explícita de quem opera.
    application_name: nomeDaAplicacao(papel),
    keepAlive: true,
    keepAliveInitialDelayMillis: KEEPALIVE_INITIAL_DELAY_MS,
  });
  const handler =
    onError ??
    ((err: Error): void => {
      // mesma disciplina de errMsg do main.ts: 1ª linha truncada, PII fora
      const error = (err.message.split('\n', 1)[0] ?? '').slice(0, 300);
      createLogger().error('pool: conexão caiu — recria no próximo uso', { error });
    });
  pool.on('connect', (client) => client.on('error', handler));
  // Guarda contra crash na re-emissão do Pool (forma 1). NÃO loga: o mesmo erro
  // já passou pelo listener por-cliente acima (o pg-pool só re-emite 'error' de
  // cliente ocioso, e o 'error' do Client dispara os dois listeners em ordem).
  pool.on('error', () => undefined);
  return pool;
}
