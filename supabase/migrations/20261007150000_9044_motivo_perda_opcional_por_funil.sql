-- O motivo de perda passa a respeitar a configuração do funil.
-- Ausência da chave preserva o comportamento histórico: obrigatório.

alter table public.crm_leads
  drop constraint if exists crm_leads_lost_reason_required;

create or replace function public.fn_validate_lost_reason_required() returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_canonical text[] := array['requested_by_customer','price','no_response','product_unavailable',
                              'cancelled_by_store','cancelled_by_customer','payment_failed','other',
                              'moved_to_another_pipeline'];
  v_pipeline_extra text[] := '{}'::text[];
  v_required boolean := true;
begin
  if new.status = 'lost' then
    select
      coalesce(p.settings->'lost_reason_required' <> 'false'::jsonb, true),
      coalesce(
        array(
          select case when jsonb_typeof(e) = 'object'
                      then nullif(e ->> 'label', '')
                      else nullif(e #>> '{}', '') end
            from jsonb_array_elements(p.settings->'lost_reasons') as t(e)
        ), '{}'::text[]
      )
      into v_required, v_pipeline_extra
      from public.crm_pipelines
     where p.id = new.pipeline_id;

    if new.lost_reason is null or length(btrim(new.lost_reason)) = 0 then
      if v_required then
        raise exception 'lost_reason_required' using errcode = '22023';
      end if;
      return new;
    end if;

    if not (new.lost_reason = any (v_canonical) or new.lost_reason = any (v_pipeline_extra)) then
      raise exception 'lost_reason_invalid: %', new.lost_reason using errcode = '22023';
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_validate_lost_reason_required on public.crm_leads;
create trigger trg_validate_lost_reason_required
  before insert or update of status, lost_reason, stage_id, pipeline_id
  on public.crm_leads
  for each row execute function public.fn_validate_lost_reason_required();

revoke execute on function public.fn_validate_lost_reason_required() from public, anon;
grant execute on function public.fn_validate_lost_reason_required() to authenticated, service_role;

comment on function public.fn_validate_lost_reason_required() is
  'Valida motivo de perda pelo funil. settings.lost_reason_required=false permite ausência; chave ausente exige o motivo. Motivo informado sempre precisa pertencer ao vocabulário do funil.';
