-- manifest: 9086 — trigger trg_contacts_fusao_fecha_card_repetido (BEFORE UPDATE OF is_merged_into em contacts): na fusao, o card aberto do absorvido que repetiria um card aberto do principal no mesmo funil (indice 9082) e movido para a etapa de perda com motivo moved_to_another_pipeline, em vez de ficar pendurado na lapide; e fn_lead_completar_campos (service_role): completa custom_fields do card reaproveitado sem sobrescrever. Sem reescrever fn_mesclar_contatos.
--
-- 9086 (P2-3 do #427): o indice 9082 recusa dois cards abertos do mesmo contato no funil. Na fusao,
-- `fn_mesclar_contatos` reaponta crm_leads.contact_id do absorvido para o principal; se os dois tinham
-- card aberto no mesmo funil, o UPDATE colide, a funcao pula a linha ("nao_repontado") e o card fica
-- no contato-lapide, invisivel. Aqui o card repetido do absorvido e FECHADO (lost, com motivo) antes do
-- repontamento: nada e apagado, o historico do card segue nele, e o do principal e quem continua aberto.
-- Pelo fato (`is_merged_into` saiu de null), nao reescrevendo a funcao (mesmo desenho da 9041).
-- shortcut: com varios absorvidos de uma vez, a unicidade entre eles depende de o UPDATE da fusao ser
-- visivel linha a linha; se nao for, o repontamento pula o repetido e a fusao o reporta em nao_repontado.
create or replace function public.fn_fusao_fecha_card_repetido()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  -- Fecha do jeito da casa: MOVE para a etapa de perda e deixa `fn_crm_lead_close_on_stage` escrever
  -- status/closed_at/lost_from_stage_id. Motivo `moved_to_another_pipeline`: o canônico que as métricas e
  -- os consumidores de `lead.lost` já tratam como "nao e perda comercial" (o card foi absorvido por outro).
  -- Funil sem etapa de perda: nao fecha, e a fusao reporta o card em `nao_repontado`.
  update public.crm_leads l
     set stage_id = (select s.id from public.crm_stages s
                      where s.pipeline_id = l.pipeline_id and s.is_lost and not s.is_archived
                      order by s.position limit 1),
         lost_reason = 'moved_to_another_pipeline'
   where exists (select 1 from public.crm_stages s
                  where s.pipeline_id = l.pipeline_id and s.is_lost and not s.is_archived)
     and l.organization_id = new.organization_id
     and l.contact_id = new.id
     and l.status = 'open'
     and l.source not in ('manual', 'nuvemshop', 'retomada')
     and l.external_id is null
     and exists (
       select 1
         from public.crm_leads m
        where m.organization_id = l.organization_id
          and m.pipeline_id = l.pipeline_id
          and m.id <> l.id
          and m.status = 'open'
          and m.source not in ('manual', 'nuvemshop', 'retomada')
          and m.external_id is null
          and (m.contact_id = new.is_merged_into
               or m.contact_id in (select c.id from public.contacts c
                                    where c.organization_id = new.organization_id
                                      and c.is_merged_into = new.is_merged_into and c.id <> new.id
                                      -- so os absorvidos DESTA fusao (merged_at = now() da transacao), nao lapides antigas
                                      and c.merged_at is not distinct from new.merged_at))
     );
  return new;
end$$;

revoke all on function public.fn_fusao_fecha_card_repetido() from public, anon, authenticated;

drop trigger if exists trg_contacts_fusao_fecha_card_repetido on public.contacts;
create trigger trg_contacts_fusao_fecha_card_repetido
  before update of is_merged_into on public.contacts
  for each row
  when (old.is_merged_into is null and new.is_merged_into is not null)
  execute function public.fn_fusao_fecha_card_repetido();

-- P2-6: o card reaproveitado recebe as respostas da chamada SEM sobrescrever o que ele ja tem, atomico
-- (o lado esquerdo do || vence: a chave existente fica). So card aberto da organizacao.
create or replace function public.fn_lead_completar_campos(p_org uuid, p_lead uuid, p_campos jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  resultado jsonb;
begin
  if p_campos is null or jsonb_typeof(p_campos) <> 'object' then
    raise exception 'campos_precisa_ser_objeto' using errcode = '22023';
  end if;
  update public.crm_leads
     set custom_fields = p_campos || coalesce(custom_fields, '{}'::jsonb)
   where organization_id = p_org and id = p_lead and status = 'open'
   returning custom_fields into resultado;
  return resultado;
end$$;

-- As DUAS origens de EXECUTE (default ACL + PUBLIC): so o service_role chama.
revoke all on function public.fn_lead_completar_campos(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_lead_completar_campos(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
