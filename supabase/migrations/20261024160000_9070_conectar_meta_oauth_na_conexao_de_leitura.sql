-- manifest: 9070 — ad_insights_connections ganha token_expires_at, scopes, connected_via e meta_user_id (todas nulas): procedencia e validade do token de leitura da Meta para o 'Conectar com Meta' (OAuth). RLS, grants e indice nao mudam. Apendice igual no baseline.sql.
--
-- 9070: Conectar com Meta (OAuth), fatia A.

set lock_timeout = '3s';

-- Conectar com Meta (OAuth): procedencia e validade do token de LEITURA. Quatro colunas
-- NULAS e sem default (so metadado no catalogo, sem reescrever a tabela). Tabela segue
-- server-side only: RLS ligada, zero policies, grants so do service_role (0214); nada disso muda.
alter table public.ad_insights_connections
  add column if not exists token_expires_at timestamptz,
  add column if not exists scopes text[],
  add column if not exists connected_via text,
  add column if not exists meta_user_id text;

comment on column public.ad_insights_connections.token_expires_at is
  'Quando o token de longa duracao vence (OAuth da Meta, ~60 dias). Nulo = token colado a mao, cuja validade a Meta nao informa. Migration 9070.';
comment on column public.ad_insights_connections.scopes is
  'Permissoes concedidas na autorizacao OAuth. Nulo em token colado a mao. Migration 9070.';
comment on column public.ad_insights_connections.connected_via is
  'Como a conexao foi feita: manual (token colado) ou oauth (Conectar com Meta). Vocabulario aberto, sem CHECK (doutrina de colunas de vocabulario aberto); vive em ProcedenciaDaConexao no TypeScript. Nulo = linha anterior a 9070. Migration 9070.';
comment on column public.ad_insights_connections.meta_user_id is
  'Id do usuario Meta que autorizou (OAuth). Identificador, nao segredo. Migration 9070.';

notify pgrst, 'reload schema';
