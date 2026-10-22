/**
 * Socket MUDO não pode pendurar quem espera a query.
 *
 * O servidor falso faz o handshake do Postgres e depois engole a query sem
 * responder nem fechar — o que o worker viu quando o Supabase reiniciou: o
 * laço do drain da IA ficou dias esperando uma query que nunca voltou. Sem o
 * teto de leitura, este teste estoura o timeout do vitest em vez de reprovar.
 */
import net from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPool, IDLE_TIMEOUT_MS, nomeDaAplicacao, QUERY_TIMEOUT_MS } from './pool';

function servidorMudo(): Promise<{
  porta: number;
  queryChegou: Promise<void>;
  fechar: () => void;
  conexoes: () => number;
  parametrosDaPartida: () => Record<string, string>;
}> {
  let avisar: () => void = () => undefined;
  const queryChegou = new Promise<void>((resolve) => (avisar = resolve));
  const sockets: net.Socket[] = [];
  let partida: Record<string, string> = {};
  const server = net.createServer((socket) => {
    sockets.push(socket);
    let handshake = false;
    socket.on('data', (buf) => {
      if (!handshake) {
        handshake = true;
        // StartupMessage: int32 tamanho, int32 versão, pares "chave\0valor\0"
        const pares = buf.subarray(8).toString('utf8').split('\0');
        partida = {};
        for (let i = 0; i + 1 < pares.length && pares[i]; i += 2) partida[pares[i]!] = pares[i + 1]!;
        // AuthenticationOk + ReadyForQuery('I')
        socket.write(Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0, 0x5a, 0, 0, 0, 5, 0x49]));
        return;
      }
      if (buf[0] === 0x51) avisar(); // 'Q' — e nunca responde
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({
        porta: port,
        queryChegou,
        fechar: () => {
          for (const s of sockets) s.destroy();
          server.close();
        },
        conexoes: () => sockets.length,
        parametrosDaPartida: () => partida,
      });
    });
  });
}

describe('createPool', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('falha a query num socket mudo em vez de esperar para sempre', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const srv = await servidorMudo();
    const pool = createPool(`postgres://teste@127.0.0.1:${srv.porta}/db`, () => undefined);
    try {
      const resultado = pool.query('select 1').then(
        () => 'respondeu',
        (err: Error) => err.message,
      );
      await srv.queryChegou;
      await vi.advanceTimersByTimeAsync(QUERY_TIMEOUT_MS + 1);
      expect(await resultado).toBe('Query read timeout');
    } finally {
      srv.fechar();
      await pool.end().catch(() => undefined);
    }
  });

  // Pool cheio é ESPERA, não erro: o before-send segura conexão durante lock,
  // throttle e envio, e as leituras do turno contam com a fila (inbound-turn,
  // get-lead-context). `connectionTimeoutMillis` transformaria essa espera em
  // 'timeout exceeded when trying to connect' — por isso o pool não o usa.
  it('com o pool cheio, quem chega espera a vaga em vez de errar', async () => {
    vi.stubEnv('DB_POOL_MAX', '1');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const srv = await servidorMudo();
    const pool = createPool(`postgres://teste@127.0.0.1:${srv.porta}/db`, () => undefined);
    try {
      const primeiro = await pool.connect();
      let desfecho = 'esperando';
      const segundo = pool.connect().then(
        (client) => {
          desfecho = 'conectou';
          return client;
        },
        (err: Error) => {
          desfecho = err.message;
          return undefined;
        },
      );
      await vi.advanceTimersByTimeAsync(2 * QUERY_TIMEOUT_MS);
      const antesDaVaga = desfecho;
      // libera ANTES de afirmar: com cliente em checkout, o pool.end() do finally
      // esperaria para sempre e o vermelho viraria timeout do vitest.
      primeiro.release();
      (await segundo)?.release();
      expect(antesDaVaga).toBe('esperando');
      expect(desfecho).toBe('conectou');
    } finally {
      srv.fechar();
      await pool.end().catch(() => undefined);
    }
  });

  // pg_stat_activity precisa dizer DE QUAL processo vem a conexão: o nome tem
  // que sair no StartupMessage, não só morar na config do objeto.
  it('a conexão se apresenta com o application_name do papel do pool', async () => {
    const srv = await servidorMudo();
    const pool = createPool(`postgres://teste@127.0.0.1:${srv.porta}/db`, () => undefined, 'worker');
    try {
      const client = await pool.connect();
      client.release();
      expect(srv.parametrosDaPartida().application_name).toBe(`crm-worker-${process.pid}`);
    } finally {
      srv.fechar();
      await pool.end().catch(() => undefined);
    }
  });

  it('sem papel declarado, o nome diz que é script (nunca vazio)', () => {
    expect(nomeDaAplicacao('script', 42)).toBe('crm-script-42');
    expect(nomeDaAplicacao('app-request', 7)).toBe('crm-app-request-7');
  });

  // O default de 10 s do pg, com o polling de 2 s do worker, fechava e reabria
  // conexão sem parar. Conexão devolvida tem que continuar no pool entre ciclos.
  it('conexão ociosa por mais de 10 s continua aberta e é reusada', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const srv = await servidorMudo();
    const pool = createPool(`postgres://teste@127.0.0.1:${srv.porta}/db`, () => undefined);
    try {
      (await pool.connect()).release();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(pool.idleCount).toBe(1);
      (await pool.connect()).release();
      expect(srv.conexoes()).toBe(1);
      // e não fica para sempre: passado o teto, a ociosa é fechada
      await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
      expect(pool.idleCount).toBe(0);
    } finally {
      srv.fechar();
      await pool.end().catch(() => undefined);
    }
  });
});
