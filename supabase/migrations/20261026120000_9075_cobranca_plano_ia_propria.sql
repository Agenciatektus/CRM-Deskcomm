-- manifest: 9075 — cobranca_planos ganha ia_propria (boolean, default false) e nasce fn_org_pode_usar_ia_da_instalacao(p_org): false quando a cobranca esta ligada e a assinatura da organizacao esta num plano com ia_propria; true em qualquer outro caso (sem plano, sem assinatura, cobranca desligada). Aditiva e compativel com imagem antiga (coluna com default). Apendice igual no baseline.sql.
--
-- 9075: plano com IA propria. Empresa nesse plano usa so a credencial de IA dela, nunca a chave da instalacao.

set lock_timeout = '3s';

alter table public.cobranca_planos
  add column if not exists ia_propria boolean not null default false;

comment on column public.cobranca_planos.ia_propria is
  'true = a empresa neste plano usa somente a credencial de IA cadastrada por ela; a chave de IA da instalacao nunca a serve. Migration 9075.';

-- A instalacao pode servir IA a esta organizacao? Mesma leitura de fn_limite_do_plano:
-- cobranca desligada ou organizacao sem assinatura = true (comportamento de sempre).
-- Vale o plano_id vigente, nunca o agendado.
create or replace function public.fn_org_pode_usar_ia_da_instalacao(p_org uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_cobranca_ligada() then
    return true;
  end if;
  return not coalesce(
    (select p.ia_propria
       from public.cobranca_assinaturas a
       join public.cobranca_planos p on p.id = a.plano_id
      where a.organization_id = p_org),
    false
  );
end;
$$;

revoke execute on function public.fn_org_pode_usar_ia_da_instalacao(uuid) from public, anon, authenticated;
grant execute on function public.fn_org_pode_usar_ia_da_instalacao(uuid) to service_role;
