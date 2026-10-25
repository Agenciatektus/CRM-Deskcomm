-- manifest: 9074 — ad_insights_connections ganha connected_by (uuid, nula: quem conectou ou colou o token) e allowed_ad_account_ids (text[], nula): a lista de contas de anuncio (act_<id>) que esta organizacao pode ver. Em conexao OAuth, nula = so a conta padrao (ou nenhuma); em token colado a mao, nula = sem restricao. Aditiva: RLS, grants e indice nao mudam. Apendice igual no baseline.sql.
--
-- 9074: contas de anuncio permitidas por organizacao (fecha o vazamento entre clientes do login pessoal).

set lock_timeout = '3s';

alter table public.ad_insights_connections
  add column if not exists allowed_ad_account_ids text[],
  add column if not exists connected_by uuid;

comment on column public.ad_insights_connections.allowed_ad_account_ids is
  'Contas de anuncio (act_<id>) que esta organizacao pode ver. Nulo = OAuth: so a conta padrao; token manual: sem restricao. Migration 9074.';

comment on column public.ad_insights_connections.connected_by is
  'Usuario que conectou (OAuth) ou colou o token. So ele (ou platform admin) amplia as contas permitidas. Nulo = conexao antiga: so platform admin amplia. Migration 9074.';
