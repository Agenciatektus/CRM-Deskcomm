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

type Consultavel = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export async function instalacaoPodeServirIa(db: Consultavel, orgId: string): Promise<boolean> {
  try {
    const { rows } = await (db as Pick<pg.Pool, 'query'>).query<{ pode: boolean | null }>(
      'select public.fn_org_pode_usar_ia_da_instalacao($1::uuid) as pode',
      [orgId],
    );
    return rows[0]?.pode === true;
  } catch (err) {
    console.error('[ia-propria] leitura falhou; instalação não serve IA (fail-closed)', {
      orgId,
      erro: err instanceof Error ? err.message.slice(0, 200) : 'desconhecido',
    });
    return false;
  }
}
