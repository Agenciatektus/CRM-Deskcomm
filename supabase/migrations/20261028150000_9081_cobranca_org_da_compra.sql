-- manifest: 9081 — fn_cobranca_org_da_compra(p_compra, p_nome, p_slug, p_plano, p_modo, p_cliente, p_assinatura): cria a empresa e a assinatura de uma compra feita por link de pagamento, numa transacao so e de forma reentrante (a compra e travada com for update). Funcao nova, so service_role. Apendice igual no baseline.sql, ANTES da varredura de anon.
--
-- 9081: fatia 3 da compra pela landing. Depois que a releitura no provedor confirma o pagamento, o servidor
-- chama esta funcao para criar a empresa (sem created_by, entao o gatilho de cadastro nao cria trial nem
-- suspende) e a assinatura ja ativa. O estado exato (vencimento, assinaturas vivas) vem do `sincronizar`.
-- Cliente do provedor ja ligado a outra empresa sobe como 23505 (indice unico provedor+cliente) e nada fica gravado.
-- Slug de outra empresa sobe como 22023 slug_em_uso.
-- Reverter: drop function if exists public.fn_cobranca_org_da_compra(uuid, text, text, uuid, text, text, text);

set lock_timeout = '3s';

create or replace function public.fn_cobranca_org_da_compra(
  p_compra uuid,
  p_nome text,
  p_slug text,
  p_plano uuid,
  p_modo text,
  p_cliente text,
  p_assinatura text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra public.cobranca_compras%rowtype;
  v_org uuid;
begin
  select * into v_compra from public.cobranca_compras where id = p_compra for update;
  if not found then
    raise exception 'compra_inexistente' using errcode = 'P0002';
  end if;
  if v_compra.empresa_criada_id is not null then
    return v_compra.empresa_criada_id;
  end if;

  if exists (select 1 from public.organizations o where o.slug = p_slug::citext) then
    raise exception 'slug_em_uso' using errcode = '22023';
  end if;

  insert into public.organizations (display_name, legal_name, slug, status, settings, created_by)
    values (p_nome, p_nome, p_slug::citext, 'active', '{}'::jsonb, null)
    returning id into v_org;

  insert into public.cobranca_assinaturas
    (organization_id, plano_id, estado, trial_ate, pagamento_inicial_pendente, periodo_pago_desde,
     provedor, modo, provedor_cliente_id, provedor_assinatura_id)
    values (v_org, p_plano, 'ativa', null, false, now(),
     'stripe', p_modo, p_cliente, nullif(p_assinatura, ''));

  update public.cobranca_compras
     set empresa_criada_id = v_org, status = 'criada'
   where id = p_compra;

  return v_org;
end;
$$;

revoke execute on function public.fn_cobranca_org_da_compra(uuid, text, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_cobranca_org_da_compra(uuid, text, text, uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
