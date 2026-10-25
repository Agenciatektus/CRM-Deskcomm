-- manifest: 9072 — ad_insights_connections ganha meta_user_name (text) e meta_businesses (jsonb, [{id,name}], no maximo 20), ambas nulas: identidade da conta Meta que conectou, para a tela dizer 'Conectado como ...'. Sem retrato de contas ou paginas (o CRM le ao vivo). RLS, grants e indice nao mudam. Apendice igual no baseline.sql.
--
-- 9072: Conectar com Meta (OAuth), fatia 1: identidade da conexao.

set lock_timeout = '3s';

alter table public.ad_insights_connections
  add column if not exists meta_user_name text,
  add column if not exists meta_businesses jsonb;

comment on column public.ad_insights_connections.meta_user_name is
  'Nome do usuario Meta que autorizou (OAuth), so para exibir na tela. Nulo = nao lido. Migration 9072.';
comment on column public.ad_insights_connections.meta_businesses is
  'Empresas (BM) do usuario Meta: [{id,name}], no maximo 20. Nulo = nao lido. Nao e retrato de contas. Migration 9072.';
