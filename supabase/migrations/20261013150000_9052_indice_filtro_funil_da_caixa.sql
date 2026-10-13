-- 9052: índice que cobre o filtro de funil e etapa da Inbox (9051).
--
-- Em produção foi criado À MÃO, com CONCURRENTLY, na release 196 (13/10/2026): a
-- contagem com p_funil na maior org caiu de ~700 ms para ~300 ms (como agent).
-- Em outra instalação com tráfego, crie antes do deploy fora de transação:
--   create index concurrently if not exists crm_leads_org_contact_cobre
--     on public.crm_leads (organization_id, contact_id) include (pipeline_id, stage_id, owner_user_id);
set lock_timeout = '3s';

create index if not exists crm_leads_org_contact_cobre
  on public.crm_leads (organization_id, contact_id)
  include (pipeline_id, stage_id, owner_user_id);
