-- 9050 — um funil pode ficar SEM fonte ("Recebe de" vazio).
--
-- Decisão do Peterson (12/10/2026): funil de pós-venda e de recompra só recebe
-- lead MOVIDO de outro funil, nunca lead novo de canal. Até aqui o CHECK
-- `crm_pipelines_fontes_conhecidas` (9012) exigia `cardinality(fontes) > 0`,
-- e esse funil não tinha como existir.
--
-- O risco que a metade `cardinality > 0` cobria continua coberto, só que em
-- outra camada: conversa de fonte que NENHUM funil da organização aceita é
-- descartada na ingestão. O `PATCH /api/v1/pipelines/[id]` responde 409
-- `fonte_sem_funil` quando a mudança tira de um funil a ÚLTIMA ocorrência de uma
-- fonte na organização, e só grava com `confirmarSemFunil: true` (a tela pede a
-- confirmação explicando que conversas novas daquele canal deixam de entrar).
--
-- O vocabulário FECHADO fica: fonte fora da lista continua recusada.
--
-- Idempotente: `drop constraint if exists` + `add` no MESMO `alter table`
-- (atômico; a tabela nunca fica sem o CHECK). A validação varre `crm_pipelines`,
-- que tem poucas linhas por organização; `lock_timeout` curto para não enfileirar
-- tráfego atrás do ACCESS EXCLUSIVE.

set local lock_timeout = '3s';

alter table public.crm_pipelines
  drop constraint if exists crm_pipelines_fontes_conhecidas,
  add constraint crm_pipelines_fontes_conhecidas
    check (fontes <@ array['whatsapp', 'instagram_direct', 'instagram_comentario']::text[]);

comment on column public.crm_pipelines.fontes is
  'De quais fontes este funil se alimenta. Vazio = só recebe leads movidos de outros funis (pós-venda, recompra). Fonte que não está em NENHUM funil da organização não gera lead nem conversa — o evento é arquivado e descartado (migrations 9012 e 9050).';

notify pgrst, 'reload schema';
