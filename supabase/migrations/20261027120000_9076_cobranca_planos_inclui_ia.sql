-- manifest: 9076 — cobranca_planos ganha inclui_ia (boolean, default false): a empresa neste plano recebe o Jev da plataforma (chave JEV_PLATFORM_API_KEY da instalacao). Marca como true o plano mensal de R$ 397 (preco_cents = 39700) que nao seja de IA propria. Aditiva, idempotente e compativel com imagem antiga (coluna com default). Apendice igual no baseline.sql.
--
-- 9076: plano com IA incluida. A tabela e da INSTALACAO (RLS ligada sem policy, so service_role): a coluna herda
-- os grants da tabela, nenhum grant novo.
-- Reverter: alter table public.cobranca_planos drop column if exists inclui_ia;

set lock_timeout = '3s';

alter table public.cobranca_planos
  add column if not exists inclui_ia boolean not null default false;

comment on column public.cobranca_planos.inclui_ia is
  'true = a empresa neste plano recebe o Jev da plataforma (JEV_PLATFORM_API_KEY) sem cadastrar chave propria. Plano com ia_propria nunca recebe. Migration 9076.';

-- O plano de R$ 397 com IA. Nao ha plano semeado em migration (os planos nascem pelo admin da cobranca):
-- a marcacao e por preco, so em plano mensal vivo e que nao seja de IA propria. Idempotente: rodar de novo nao muda nada.
update public.cobranca_planos
   set inclui_ia = true
 where preco_cents = 39700
   and intervalo = 'mes'
   and arquivado_em is null
   and ia_propria = false
   and inclui_ia = false;

notify pgrst, 'reload schema';
