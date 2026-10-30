-- manifest: 9086 — trigger trg_contacts_fusao_fecha_card_repetido (BEFORE UPDATE OF is_merged_into em contacts): na fusao, o card aberto do absorvido que repetiria um card aberto do principal no mesmo funil (indice 9082) e fechado como perdido ("Contato mesclado"), em vez de ficar pendurado na lapide. Sem reescrever fn_mesclar_contatos.
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
  update public.crm_leads l
     set status = 'lost',
         closed_at = now(),
         lost_from_stage_id = l.stage_id,
         lost_reason = 'Contato mesclado: o contato principal já tinha um negócio aberto neste funil'
   where l.organization_id = new.organization_id
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
                                    where c.is_merged_into = new.is_merged_into and c.id <> new.id))
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

notify pgrst, 'reload schema';
