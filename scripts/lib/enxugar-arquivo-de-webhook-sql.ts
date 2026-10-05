/**
 * As consultas e a regra de linha da limpeza retroativa do arquivo de webhook
 * (`scripts/enxugar-arquivo-de-webhook-retroativo.ts`). Separado para o
 * script caber na cabeça: aqui mora O QUE é lido e gravado; lá, o laço.
 */
import { cabecalhosParaArquivo } from "../../lib/channels/cabecalhos-para-arquivo";
import { arquivoEnxuto, enxugarParaArquivo, TETO_DE_TEXTO } from "../../lib/channels/enxugar-para-arquivo";

export interface ClienteSql {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface Tamanhos {
  id: string;
  received_at: string;
  tam_raw: number | null;
  tam_parsed: number | null;
  tam_headers: number | null;
}

export interface Conteudo {
  id: string;
  raw_body: string | null;
  payload_parsed: unknown;
  headers: Record<string, string> | null;
}

export type LinhaNova = Omit<Conteudo, "id">;

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

export const SQL_CONTEUDO = `
select id, raw_body, payload_parsed, headers
  from public.webhook_events_log
 where id = any($1::uuid[])`;

/**
 * O tamanho que cada linha NOVA ocuparia, medido pelo próprio Postgres. Sem
 * compressão (o valor ainda não foi armazenado), então é um TETO: se ele já é
 * menor que o armazenado (comprimido), a linha encolhe de verdade.
 */
export const SQL_MEDIR = `
select coalesce(pg_column_size(u.r), 0) + coalesce(pg_column_size(u.p::jsonb), 0) + coalesce(pg_column_size(u.h::jsonb), 0) as depois
  from unnest($1::text[], $2::text[], $3::text[]) with ordinality as u(r, p, h, ordem)
 order by u.ordem`;

/**
 * Grava só se a linha não mudou desde a varredura (mesmos tamanhos) E se o
 * novo é MENOR que o armazenado — a trava final contra crescer, no banco.
 */
export const SQL_GRAVAR = `
update public.webhook_events_log
   set raw_body = $2, payload_parsed = $3::jsonb, headers = $4::jsonb
 where id = $1
   and pg_column_size(raw_body) is not distinct from $5
   and pg_column_size(payload_parsed) is not distinct from $6
   and pg_column_size(headers) is not distinct from $7
   and coalesce(pg_column_size($2::text), 0) + coalesce(pg_column_size($3::jsonb), 0) + coalesce(pg_column_size($4::jsonb), 0)
     < coalesce(pg_column_size(raw_body), 0) + coalesce(pg_column_size(payload_parsed), 0) + coalesce(pg_column_size(headers), 0)`;

export function ehGrande(t: Tamanhos): boolean {
  return [t.tam_raw, t.tam_parsed, t.tam_headers].some((n) => (n ?? 0) > TETO_DE_TEXTO);
}

export function antesDe(t: Tamanhos): number {
  return (t.tam_raw ?? 0) + (t.tam_parsed ?? 0) + (t.tam_headers ?? 0);
}

function headersEnxutos(h: Record<string, string> | null): Record<string, string> | null {
  if (!h || typeof h !== "object") return h;
  try {
    return cabecalhosParaArquivo(new Headers(h));
  } catch {
    // Nome de header inválido para a API `Headers`: decide chave a chave.
    return enxugarParaArquivo(h).payload;
  }
}

/** A linha como ela fica depois da regra; `null` se nada muda. */
export function linhaEnxuta(c: Conteudo): LinhaNova | null {
  const raw = c.raw_body === null ? null : arquivoEnxuto(c.raw_body).rawBody;
  const parsed = c.payload_parsed === null ? null : enxugarParaArquivo(c.payload_parsed).payload;
  const headers = headersEnxutos(c.headers);
  const mudou =
    raw !== c.raw_body ||
    JSON.stringify(parsed) !== JSON.stringify(c.payload_parsed) ||
    JSON.stringify(headers) !== JSON.stringify(c.headers);
  return mudou ? { raw_body: raw, payload_parsed: parsed, headers } : null;
}

/** Os três valores como parâmetros de texto (`$2`, `$3`, `$4`). */
export function parametros(nova: LinhaNova): [string | null, string | null, string | null] {
  return [
    nova.raw_body,
    nova.payload_parsed === null ? null : JSON.stringify(nova.payload_parsed),
    nova.headers === null ? null : JSON.stringify(nova.headers),
  ];
}

export async function lerConteudo(db: ClienteSql, ids: string[]): Promise<Map<string, Conteudo>> {
  if (ids.length === 0) return new Map();
  const { rows } = await db.query<Conteudo>(SQL_CONTEUDO, [ids]);
  return new Map(rows.map((r) => [r.id, r]));
}
