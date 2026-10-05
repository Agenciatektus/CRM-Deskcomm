/**
 * Limpeza RETROATIVA do arquivo de webhook: tira mídia inteira (e o que mais a
 * regra do arquivador omite) das linhas que JÁ estão em `webhook_events_log`.
 *
 * O conserto do caminho de gravação (`lib/channels/enxugar-para-arquivo.ts`) só
 * vale daqui para a frente. Medido em 05/10/2026: 15 linhas do provider
 * `verdash` com a mídia inteira (até 10 MB cada, 150 MB no total); o token já
 * saía como `"[omitido]"`. Este script passa as linhas pela MESMA regra do
 * arquivador — um só lugar decide o que é segredo e o que é peso.
 *
 * ⛔ NUNCA o provider `waha`. O cron `webhook-replay`
 * (`lib/channels/reprocessar-arquivo-de-webhook.ts`) relê o `payload_parsed`
 * das linhas `waha` com erro transitório e as REINGERE: enxugar essas linhas
 * trocaria o texto da mensagem do cliente por um marcador. O script recusa
 * `--provider waha` — no CLI e na função.
 *
 * ─── Caminho padrão: `--so-grandes` ─────────────────────────────────────────
 *
 * O que libera espaço é a linha com mídia inteira (> 4 KB armazenados). As
 * linhas PEQUENAS que ainda têm algo a omitir (`mediaKey`/`messageSecret` do
 * protobuf do WhatsApp, gravados antes da #98) somam pouco, e a retenção D+7
 * (`lib/channels/retencao-do-arquivo.ts`, cron vivo) zera `raw_body`,
 * `payload_parsed` e `headers` delas sozinha: as de até 05/10 somem até 12/10.
 * Reescrevê-las só gera TOAST novo e autovacuum. Sem `--so-grandes` elas também
 * entram, e só se encolherem.
 *
 * Seguro para produção, de propósito (cada item custou um incidente):
 *  - SIMULA por padrão. Só grava com `--aplicar`.
 *  - DECIDE PELO TAMANHO, sem destostar: a varredura lê só `pg_column_size`.
 *    Na SIMULAÇÃO a linha grande nunca é aberta (e por isso não é medida).
 *  - NUNCA CRESCE UMA LINHA. A 1ª versão, rodada em produção em 05/10/2026,
 *    gravou 500 linhas e levou 2,4 MB a 4,0 MB (+63%): `pg_column_size` mede o
 *    valor ARMAZENADO (comprimido), a linha reescrita ficava abaixo do limiar
 *    de compressão, e o marcador era um objeto com sha de 64 caracteres. Agora
 *    o marcador é uma string curta, cada linha nova é MEDIDA pelo Postgres
 *    antes (sem compressão: um teto) e só é gravada se for menor que a
 *    armazenada — e o próprio UPDATE repete a condição. Quem cresceria é pulada
 *    e contada em `puladasPorCrescer`.
 *  - Lotes pequenos (`--lote`, padrão 10, teto 50), pausa (`--pausa-ms`, padrão
 *    3000) e teto por rodada (`--max`, padrão 500).
 *  - `statement_timeout` (padrão 15 s) dentro da transação, MENOR que o timeout
 *    do cliente (2×): timeout só do cliente deixa consulta órfã segurando linha.
 *  - Sem corrida: o UPDATE exige os mesmos tamanhos lidos na varredura
 *    (`puladasPorCorrida`). Rodar de novo não refaz nada.
 *  - Retoma: `--depois-de '<received_at>|<id>'` com o cursor impresso.
 *
 * Uso (túnel para o Postgres do CRM, `SUPABASE_DB_URL` apontando para ele):
 *   pnpm exec tsx scripts/enxugar-arquivo-de-webhook-retroativo.ts --so-grandes            # simula
 *   pnpm exec tsx scripts/enxugar-arquivo-de-webhook-retroativo.ts --so-grandes --aplicar --max 200
 *   … --depois-de '<cursor>'   --provider <nome> (padrão verdash; waha é recusado)
 */
import {
  antesDe,
  type ClienteSql,
  ehGrande,
  lerConteudo,
  type LinhaNova,
  linhaEnxuta,
  parametros,
  SQL_GRAVAR,
  SQL_MEDIR,
  SQL_VARREDURA,
  type Tamanhos,
} from "./lib/enxugar-arquivo-de-webhook-sql";

export { linhaEnxuta, SQL_GRAVAR, SQL_MEDIR, SQL_VARREDURA, type ClienteSql };

export interface OpcoesDaLimpeza {
  aplicar: boolean;
  provider: string;
  lote: number;
  max: number;
  pausaMs: number;
  statementTimeoutMs: number;
  /** Só linhas com alguma coluna > 4 KB armazenada (mídia inteira). */
  soGrandes?: boolean;
  depoisDe?: { receivedAt: string; id: string };
  log?: (linha: string) => void;
  dormir?: (ms: number) => Promise<void>;
}

export interface ResultadoDaLimpeza {
  varridas: number;
  grandes: number;
  /** Pequenas que ainda tinham algo a omitir (0 com `--so-grandes`). */
  pequenasComSegredo: number;
  /** Gravadas (com `--aplicar`) ou que seriam (simulação: só as medidas). */
  gravadas: number;
  /** A reescrita não encolheria a linha: pulada. */
  puladasPorCrescer: number;
  /** A linha mudou entre a varredura e o UPDATE (retenção, cron): pulada. */
  puladasPorCorrida: number;
  /** Tamanho armazenado ANTES, só das gravadas. */
  bytesAntes: number;
  /** Tamanho DEPOIS (teto, sem compressão), só das gravadas. */
  bytesDepois: number;
  bytesEconomizados: number;
  cursor: string | null;
}

interface Item {
  t: Tamanhos;
  nova: LinhaNova;
  depois?: number;
}

const CURSOR_INICIAL = { receivedAt: "-infinity", id: "00000000-0000-0000-0000-000000000000" };

/**
 * Providers cujo arquivo é RELIDO para reingestão: enxugar quebraria o replay.
 * Ver `reprocessarArquivoDeWebhooks` (`.eq("provider", "waha")`).
 */
export const PROVIDERS_RECUSADOS = ["waha"] as const;

export function conferirProvider(provider: string): void {
  if ((PROVIDERS_RECUSADOS as readonly string[]).includes(provider.trim().toLowerCase())) {
    throw new Error(
      `--provider ${provider} recusado: o cron webhook-replay reingere o payload_parsed dessas linhas, e enxugar trocaria a mensagem por marcador.`,
    );
  }
}

/** Mede o tamanho novo de cada item numa consulta só e separa quem encolhe. */
async function quemEncolhe(db: ClienteSql, itens: Item[]): Promise<{ encolhem: Item[]; crescem: number }> {
  if (itens.length === 0) return { encolhem: [], crescem: 0 };
  const ps = itens.map((i) => parametros(i.nova));
  const { rows } = await db.query<{ depois: number }>(SQL_MEDIR, [
    ps.map((p) => p[0]),
    ps.map((p) => p[1]),
    ps.map((p) => p[2]),
  ]);
  const encolhem: Item[] = [];
  let crescem = 0;
  itens.forEach((item, k) => {
    const depois = Number(rows[k]?.depois ?? Number.POSITIVE_INFINITY);
    if (depois < antesDe(item.t)) encolhem.push({ ...item, depois });
    else crescem++;
  });
  return { encolhem, crescem };
}

async function gravarLote(db: ClienteSql, itens: Item[], statementTimeoutMs: number): Promise<Item[]> {
  const gravados: Item[] = [];
  await db.query("begin");
  try {
    await db.query(`set local statement_timeout = ${Math.floor(statementTimeoutMs)}`);
    await db.query("set local lock_timeout = 2000");
    for (const item of itens) {
      const { t, nova } = item;
      const r = await db.query(SQL_GRAVAR, [t.id, ...parametros(nova), t.tam_raw, t.tam_parsed, t.tam_headers]);
      if ((r.rowCount ?? 0) > 0) gravados.push(item);
    }
    await db.query("commit");
  } catch (err) {
    await db.query("rollback").catch(() => undefined);
    throw err;
  }
  return gravados;
}

async function candidatosDoLote(db: ClienteSql, rows: Tamanhos[], opcoes: OpcoesDaLimpeza) {
  const grandes = rows.filter(ehGrande);
  const pequenas = opcoes.soGrandes ? [] : rows.filter((t) => !ehGrande(t));
  // Pequena mora inline: ler é barato. Grande só é aberta para GRAVAR.
  const abrir = opcoes.aplicar ? [...pequenas, ...grandes] : pequenas;
  const conteudo = await lerConteudo(db, abrir.map((t) => t.id));
  const itens: Item[] = [];
  let pequenasComSegredo = 0;
  for (const t of abrir) {
    const c = conteudo.get(t.id);
    const nova = c ? linhaEnxuta(c) : null;
    if (!nova) continue;
    if (!ehGrande(t)) pequenasComSegredo++;
    itens.push({ t, nova });
  }
  return { grandes: grandes.length, pequenasComSegredo, itens };
}

export async function limparArquivoDeWebhook(db: ClienteSql, opcoes: OpcoesDaLimpeza): Promise<ResultadoDaLimpeza> {
  conferirProvider(opcoes.provider);
  const log = opcoes.log ?? ((l: string) => console.info(l));
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const r: ResultadoDaLimpeza = {
    varridas: 0, grandes: 0, pequenasComSegredo: 0, gravadas: 0, puladasPorCrescer: 0, puladasPorCorrida: 0,
    bytesAntes: 0, bytesDepois: 0, bytesEconomizados: 0, cursor: null,
  };
  let cursor = opcoes.depoisDe ?? CURSOR_INICIAL;
  const lote = Math.max(1, Math.min(opcoes.lote, 50));

  await db.query(`set statement_timeout = ${Math.floor(opcoes.statementTimeoutMs)}`);

  while (r.varridas < opcoes.max) {
    const { rows } = await db.query<Tamanhos>(SQL_VARREDURA, [
      opcoes.provider, cursor.receivedAt, cursor.id, Math.min(lote, opcoes.max - r.varridas),
    ]);
    if (rows.length === 0) break;
    r.varridas += rows.length;
    const ultima = rows[rows.length - 1]!;
    cursor = { receivedAt: ultima.received_at, id: ultima.id };
    r.cursor = `${cursor.receivedAt}|${cursor.id}`;

    const c = await candidatosDoLote(db, rows, opcoes);
    r.grandes += c.grandes;
    r.pequenasComSegredo += c.pequenasComSegredo;

    const { encolhem, crescem } = await quemEncolhe(db, c.itens);
    r.puladasPorCrescer += crescem;
    let efetivos = encolhem;
    if (opcoes.aplicar) {
      efetivos = encolhem.length > 0 ? await gravarLote(db, encolhem, opcoes.statementTimeoutMs) : [];
      r.puladasPorCorrida += encolhem.length - efetivos.length;
    }
    for (const item of efetivos) {
      r.gravadas++;
      r.bytesAntes += antesDe(item.t);
      r.bytesDepois += item.depois ?? 0;
    }
    r.bytesEconomizados = r.bytesAntes - r.bytesDepois;

    log(
      `lote: ${rows.length} varridas, ${c.grandes} grandes, ${c.itens.length} a enxugar, ${crescem} pulariam por crescer — ` +
        `${opcoes.aplicar ? "gravadas" : "simuladas"} ${r.gravadas}, ${r.bytesEconomizados} bytes economizados — cursor ${r.cursor}`,
    );
    if (rows.length < lote) break;
    await dormir(opcoes.pausaMs);
  }
  return r;
}

export function lerOpcoes(argv: string[]): OpcoesDaLimpeza {
  const valor = (nome: string) => {
    const i = argv.indexOf(nome);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const numero = (nome: string, padrao: number) => {
    const v = Number(valor(nome) ?? padrao);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${nome} precisa ser número positivo`);
    return v;
  };
  const provider = valor("--provider") ?? "verdash";
  conferirProvider(provider);
  const depois = valor("--depois-de");
  const [receivedAt, id] = depois ? depois.split("|") : [];
  return {
    aplicar: argv.includes("--aplicar"),
    soGrandes: argv.includes("--so-grandes"),
    provider,
    lote: Math.min(numero("--lote", 10), 50),
    max: numero("--max", 500),
    pausaMs: numero("--pausa-ms", 3000),
    statementTimeoutMs: numero("--statement-timeout-ms", 15_000),
    depoisDe: receivedAt && id ? { receivedAt, id } : undefined,
  };
}

async function principal(): Promise<void> {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL ausente: o script fala direto com o Postgres (statement_timeout).");
  const pg = (await import("pg")).default;
  // Timeout do CLIENTE sempre maior que o do servidor: quem cancela é o banco.
  const client = new pg.Client({
    connectionString: url,
    query_timeout: opcoes.statementTimeoutMs * 2,
    application_name: "enxugar-arquivo-retroativo",
  });
  await client.connect();
  console.info(
    `${opcoes.aplicar ? "APLICANDO" : "SIMULAÇÃO (use --aplicar para gravar)"} — provider=${opcoes.provider} ` +
      `${opcoes.soGrandes ? "so-grandes " : ""}lote=${opcoes.lote} max=${opcoes.max} pausa=${opcoes.pausaMs}ms ` +
      `statement_timeout=${opcoes.statementTimeoutMs}ms`,
  );
  try {
    const r = await limparArquivoDeWebhook(client as unknown as ClienteSql, opcoes);
    console.info(JSON.stringify(r));
    if (r.cursor) console.info(`Para continuar: --depois-de '${r.cursor}'`);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/enxugar-arquivo-de-webhook-retroativo.ts")) {
  principal().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
