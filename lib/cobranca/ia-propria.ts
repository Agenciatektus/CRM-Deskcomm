/**
 * Plano com IA própria: a empresa nesse plano usa SOMENTE a credencial de IA
 * cadastrada por ela, nunca a chave da instalação (env). A decisão mora no banco
 * (`fn_org_pode_usar_ia_da_instalacao`, migration 9075); este é o ÚNICO ponto do
 * TypeScript que a consulta, para que cada caminho de IA pergunte a mesma coisa.
 *
 * Falha FECHADA: erro de leitura vale "a instalação não serve" (false), com log.
 * Sem plano ou com a cobrança desligada o banco responde true e nada muda.
 */
import type pg from 'pg';

export const MENSAGEM_IA_PROPRIA_SEM_CREDENCIAL =
  'Esta empresa usa IA própria: cadastre a chave de IA da empresa para ativar.';

export const CODIGO_IA_PROPRIA_SEM_CREDENCIAL = 'ia_propria_sem_credencial';

export class IaPropriaSemCredencialError extends Error {
  override readonly name = 'IaPropriaSemCredencialError';
  readonly code = CODIGO_IA_PROPRIA_SEM_CREDENCIAL;
  constructor() {
    super(MENSAGEM_IA_PROPRIA_SEM_CREDENCIAL);
  }
}

export const MENSAGEM_SEM_CHAVE_OPENAI_NA_INSTALACAO =
  'A chave da OpenAI não está configurada na instalação (OPENAI_API_KEY) e a empresa não cadastrou a sua.';

/** Por que a voz ficou sem chave: plano com IA própria sem credencial, ou instalação sem OPENAI_API_KEY. */
export type MotivoSemChaveDaVoz = 'ia_propria' | 'instalacao';

export function mensagemSemChaveDaVoz(motivo: MotivoSemChaveDaVoz | undefined): string {
  return motivo === 'instalacao' ? MENSAGEM_SEM_CHAVE_OPENAI_NA_INSTALACAO : MENSAGEM_IA_PROPRIA_SEM_CREDENCIAL;
}

export function erroDeVozSemChave(motivo: MotivoSemChaveDaVoz | undefined): Error {
  return motivo === 'instalacao' ? new Error(MENSAGEM_SEM_CHAVE_OPENAI_NA_INSTALACAO) : new IaPropriaSemCredencialError();
}

/**
 * Falha FECHADA continua valendo, mas o log separa "leitura quebrou" (com o
 * código do erro do banco/PostgREST) de "o plano veda", que não loga nada.
 */
function logarLeituraQuebrada(orgId: string, err: unknown): void {
  console.error('[ia-propria] leitura do plano quebrou; instalação não serve IA (fail-closed)', {
    orgId,
    motivo: 'leitura_quebrou',
    codigo: (err as { code?: unknown } | null)?.code ?? null,
    erro: err instanceof Error ? err.message.slice(0, 200) : 'desconhecido',
  });
}

type Consultavel = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export async function instalacaoPodeServirIa(db: Consultavel, orgId: string): Promise<boolean> {
  try {
    const { rows } = await (db as Pick<pg.Pool, 'query'>).query<{ pode: boolean | null }>(
      'select public.fn_org_pode_usar_ia_da_instalacao($1::uuid) as pode',
      [orgId],
    );
    return rows[0]?.pode === true;
  } catch (err) {
    logarLeituraQuebrada(orgId, err);
    return false;
  }
}

/** Cliente com `rpc` (supabase-js); tipagem mínima para não acoplar ao schema gerado. */
interface ComRpc {
  rpc: (fn: never, args: never) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Mesma pergunta de `instalacaoPodeServirIa`, para os caminhos que falam com o
 * banco por supabase-js (embeddings). Mesma função SQL, mesma falha FECHADA.
 */
export async function instalacaoPodeServirIaViaRpc(admin: unknown, orgId: string): Promise<boolean> {
  return (await lerViaRpc(admin, orgId)) === true;
}

/** true/false lidos com sucesso; null = leitura quebrou (já logada). */
async function lerViaRpc(admin: unknown, orgId: string): Promise<boolean | null> {
  try {
    const { data, error } = await (admin as ComRpc).rpc(
      'fn_org_pode_usar_ia_da_instalacao' as never,
      { p_org: orgId } as never,
    );
    if (error) throw Object.assign(new Error(error.message), { code: (error as { code?: string }).code });
    return data === true;
  } catch (err) {
    logarLeituraQuebrada(orgId, err);
    return null;
  }
}

const MEMO_IA_PROPRIA_MS = 30_000;
const memoIaPropria = new Map<string, { pode: boolean; ate: number }>();

/**
 * `instalacaoPodeServirIaViaRpc` com memo de 30 s por org, para os caminhos
 * quentes (cada turno do agente). Só memoriza true/false lidos com sucesso:
 * leitura quebrada devolve false (fail-closed) SEM gravar no memo.
 */
export async function instalacaoPodeServirIaComMemo(
  admin: unknown,
  orgId: string,
  agora: number = Date.now(),
): Promise<boolean> {
  const memo = memoIaPropria.get(orgId);
  if (memo !== undefined && memo.ate > agora) return memo.pode;
  const lido = await lerViaRpc(admin, orgId);
  if (lido === null) return false;
  memoIaPropria.set(orgId, { pode: lido, ate: agora + MEMO_IA_PROPRIA_MS });
  return lido;
}

/** Só para teste: esquece o memo. */
export function invalidarMemoIaPropria(): void {
  memoIaPropria.clear();
}
