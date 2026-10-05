/**
 * Limpeza RETROATIVA do arquivo de webhook: tira token/segredo e mídia inteira
 * das linhas que JÁ estão gravadas em `webhook_events_log`.
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
 * (teto de 4 KB, chave sensível) trocaria o texto da mensagem do cliente por um
 * marcador. O script recusa `--provider waha` — no CLI e na função.
 *
 * Seguro para produção, de propósito (o incidente de 28/09 ensinou cada item):
 *  - SIMULA por padrão. Só grava com `--aplicar`.
 *  - DECIDE PELO TAMANHO, sem destostar: a varredura lê só `pg_column_size` de
 *    cada coluna. Linha grande (> `TETO_DE_TEXTO`) é candidata sem abrir o
 *    valor; linha pequena mora inline na página (não tem TOAST) e é lida para
 *    procurar o token. Na SIMULAÇÃO a linha grande nunca é aberta.
 *  - Lotes pequenos (`--lote`, padrão 10, teto 50) com pausa entre eles
 *    (`--pausa-ms`, padrão 3000) e teto por rodada (`--max`, padrão 500).
 *    UPDATE em massa reescreve TOAST e dispara autovacuum; foi isso que
 *    derrubou o banco pela segunda vez em 28/09.
 *  - `statement_timeout` (padrão 15 s) MENOR que o timeout do cliente (padrão
 *    30 s): timeout só do cliente deixa a consulta órfã no servidor segurando as
 *    linhas, e os lotes seguintes morrem em `lock_timeout`.
 *  - IDEMPOTENTE e sem corrida: o UPDATE exige que o tamanho das colunas seja o
 *    MESMO lido na varredura. Se a retenção ou o cron mexeu na linha no meio, ela
 *    é pulada. Rodar de novo não refaz nada (linha limpa sai igual da regra).
 *  - Retoma: `--depois-de '<received_at>|<id>'` com o cursor que a rodada imprime.
 *
 * Uso (com túnel para o Postgres do CRM, `SUPABASE_DB_URL` apontando para ele):
 *   pnpm exec tsx scripts/enxugar-arquivo-de-webhook-retroativo.ts                       # simula
 *   pnpm exec tsx scripts/enxugar-arquivo-de-webhook-retroativo.ts --aplicar --max 200
 *   pnpm exec tsx scripts/enxugar-arquivo-de-webhook-retroativo.ts --aplicar --depois-de '<cursor>'
 *   --provider <nome> (padrão: verdash; `waha` é recusado)
 */
import { cabecalhosParaArquivo } from "../lib/channels/cabecalhos-para-arquivo";
import { arquivoEnxuto, enxugarParaArquivo, TETO_DE_TEXTO } from "../lib/channels/enxugar-para-arquivo";

export interface ClienteSql {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface OpcoesDaLimpeza {
  aplicar: boolean;
  provider: string;
  lote: number;
  max: number;
  pausaMs: number;
  statementTimeoutMs: number;
  depoisDe?: { receivedAt: string; id: string };
  log?: (linha: string) => void;
  dormir?: (ms: number) => Promise<void>;
}

export interface ResultadoDaLimpeza {
  varridas: number;
  grandes: number;
  comSegredo: number;
  gravadas: number;
  puladas: number;
  bytesAntes: number;
  bytesDepois: number;
  cursor: string | null;
}

interface Tamanhos {
  id: string;
  received_at: string;
  tam_raw: number | null;
  tam_parsed: number | null;
  tam_headers: number | null;
}

interface Conteudo {
  id: string;
  raw_body: string | null;
  payload_parsed: unknown;
  headers: Record<string, string> | null;
}

/** A varredura NÃO seleciona o conteúdo: só tamanhos, para não destostar. */
export const SQL_VARREDURA = `
select id, received_at::text as received_at,
       pg_column_size(raw_body) as tam_raw,
       pg_column_size(payload_parsed) as tam_parsed,
       pg_column_size(headers) as tam_headers
  from public.webhook_events_log
 where provider = $1
   and (received_at, id) > ($2::timestamptz, $3::uuid)
 order by received_at, id
 limit $4`;

const SQL_CONTEUDO = `
select id, raw_body, payload_parsed, headers
  from public.webhook_events_log
 where id = any($1::uuid[])`;

const SQL_GRAVAR = `
update public.webhook_events_log
   set raw_body = $2, payload_parsed = $3::jsonb, headers = $4::jsonb
 where id = $1
   and pg_column_size(raw_body) is not distinct from $5
   and pg_column_size(payload_parsed) is not distinct from $6
   and pg_column_size(headers) is not distinct from $7`;

const CURSOR_INICIAL = { receivedAt: "-infinity", id: "00000000-0000-0000-0000-000000000000" };

function ehGrande(t: Tamanhos): boolean {
  return [t.tam_raw, t.tam_parsed, t.tam_headers].some((n) => (n ?? 0) > TETO_DE_TEXTO);
}

function headersEnxutos(h: Record<string, string> | null): Record<string, string> | null {
  if (!h || typeof h !== "object") return h;
  try {
    return cabecalhosParaArquivo(new Headers(h));
  } catch {
    // Nome de header inválido para a API `Headers`: decide chave a chave.
    const { payload } = enxugarParaArquivo(h);
    return payload;
  }
}

/** A linha como ela fica depois da regra; `null` se nada muda. */
export function linhaEnxuta(c: Conteudo): Omit<Conteudo, "id"> | null {
  const raw = c.raw_body === null ? null : arquivoEnxuto(c.raw_body).rawBody;
  const parsed = c.payload_parsed === null ? null : enxugarParaArquivo(c.payload_parsed).payload;
  const headers = headersEnxutos(c.headers);
  const mudou =
    raw !== c.raw_body ||
    JSON.stringify(parsed) !== JSON.stringify(c.payload_parsed) ||
    JSON.stringify(headers) !== JSON.stringify(c.headers);
  return mudou ? { raw_body: raw, payload_parsed: parsed, headers } : null;
}

function tamanhoDe(c: Omit<Conteudo, "id">): number {
  return (c.raw_body?.length ?? 0) + JSON.stringify(c.payload_parsed ?? null).length + JSON.stringify(c.headers ?? null).length;
}

async function lerConteudo(db: ClienteSql, ids: string[]): Promise<Map<string, Conteudo>> {
  if (ids.length === 0) return new Map();
  const { rows } = await db.query<Conteudo>(SQL_CONTEUDO, [ids]);
  return new Map(rows.map((r) => [r.id, r]));
}

async function gravarLote(
  db: ClienteSql,
  itens: Array<{ t: Tamanhos; nova: Omit<Conteudo, "id"> }>,
  statementTimeoutMs: number,
): Promise<{ gravadas: number; puladas: number }> {
  let gravadas = 0;
  let puladas = 0;
  await db.query("begin");
  try {
    await db.query(`set local statement_timeout = ${Math.floor(statementTimeoutMs)}`);
    await db.query("set local lock_timeout = 2000");
    for (const { t, nova } of itens) {
      const r = await db.query(SQL_GRAVAR, [
        t.id,
        nova.raw_body,
        nova.payload_parsed === null ? null : JSON.stringify(nova.payload_parsed),
        nova.headers === null ? null : JSON.stringify(nova.headers),
        t.tam_raw,
        t.tam_parsed,
        t.tam_headers,
      ]);
      if ((r.rowCount ?? 0) > 0) gravadas++;
      else puladas++;
    }
    await db.query("commit");
  } catch (err) {
    await db.query("rollback").catch(() => undefined);
    throw err;
  }
  return { gravadas, puladas };
}

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

export async function limparArquivoDeWebhook(
  db: ClienteSql,
  opcoes: OpcoesDaLimpeza,
): Promise<ResultadoDaLimpeza> {
  conferirProvider(opcoes.provider);
  const log = opcoes.log ?? ((l: string) => console.info(l));
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const r: ResultadoDaLimpeza = {
    varridas: 0, grandes: 0, comSegredo: 0, gravadas: 0, puladas: 0, bytesAntes: 0, bytesDepois: 0, cursor: null,
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

    const grandes = rows.filter(ehGrande);
    const pequenas = rows.filter((t) => !ehGrande(t));
    r.grandes += grandes.length;
    for (const t of grandes) r.bytesAntes += (t.tam_raw ?? 0) + (t.tam_parsed ?? 0) + (t.tam_headers ?? 0);

    // Pequena mora inline: ler é barato. Grande só é aberta para GRAVAR.
    const aGravar: Array<{ t: Tamanhos; nova: Omit<Conteudo, "id"> }> = [];
    const conteudoPequeno = await lerConteudo(db, pequenas.map((t) => t.id));
    for (const t of pequenas) {
      const c = conteudoPequeno.get(t.id);
      const nova = c ? linhaEnxuta(c) : null;
      if (!nova) continue;
      r.comSegredo++;
      aGravar.push({ t, nova });
    }
    const pequenasComSegredo = aGravar.length;

    if (opcoes.aplicar) {
      const conteudoGrande = await lerConteudo(db, grandes.map((t) => t.id));
      for (const t of grandes) {
        const c = conteudoGrande.get(t.id);
        const nova = c ? linhaEnxuta(c) : null;
        if (nova) aGravar.push({ t, nova });
      }
      if (aGravar.length > 0) {
        const g = await gravarLote(db, aGravar, opcoes.statementTimeoutMs);
        r.gravadas += g.gravadas;
        r.puladas += g.puladas;
        for (const { nova } of aGravar) r.bytesDepois += tamanhoDe(nova);
      }
    }

    log(
      `lote: ${rows.length} varridas, ${grandes.length} grandes, ${pequenasComSegredo} pequenas com segredo` +
        (opcoes.aplicar ? `, ${r.gravadas} gravadas até agora` : "") + ` — cursor ${r.cursor}`,
    );
    if (rows.length < lote) break;
    await dormir(opcoes.pausaMs);
  }
  return r;
}

function provedorConferido(p: string): string {
  conferirProvider(p);
  return p;
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
  const depois = valor("--depois-de");
  const [receivedAt, id] = depois ? depois.split("|") : [];
  return {
    aplicar: argv.includes("--aplicar"),
    provider: provedorConferido(valor("--provider") ?? "verdash"),
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
  // Timeout do CLIENTE sempre maior que o do servidor: quem cancela é o banco.
  const queryTimeout = opcoes.statementTimeoutMs * 2;
  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString: url, query_timeout: queryTimeout, application_name: "enxugar-arquivo-retroativo" });
  await client.connect();
  console.info(
    `${opcoes.aplicar ? "APLICANDO" : "SIMULAÇÃO (use --aplicar para gravar)"} — provider=${opcoes.provider} ` +
      `lote=${opcoes.lote} max=${opcoes.max} pausa=${opcoes.pausaMs}ms statement_timeout=${opcoes.statementTimeoutMs}ms`,
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
