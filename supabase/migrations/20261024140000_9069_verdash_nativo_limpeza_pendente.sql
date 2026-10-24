-- manifest: 9069 — Verdash nativo (FZAP): fn_marcar_limpeza_nativa liga/desliga a chave limpeza_fzap_pendente_em em channel_sessions.metadata (inclusive canal arquivado) numa instrucao, sem ler-espalhar-regravar. Marca a instancia do FZAP que nao pode ser desligada/apagada ao arquivar ou excluir o canal, para o varredor. Idempotente; apendice igual no baseline.sql.

create or replace function public.fn_marcar_limpeza_nativa(
  p_org uuid,
  p_canal uuid,
  p_pendente boolean
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  -- Atomico: so a chave `limpeza_fzap_pendente_em` muda (`||` e `-` no proprio UPDATE).
  -- Vale tambem para canal arquivado (e nele que a limpeza pendente precisa ficar marcada).
  update public.channel_sessions
     set metadata = case
       when p_pendente then coalesce(metadata, '{}'::jsonb)
         || jsonb_build_object('limpeza_fzap_pendente_em', to_jsonb(now()))
       else coalesce(metadata, '{}'::jsonb) - 'limpeza_fzap_pendente_em' end
   where organization_id = p_org
     and id = p_canal
     and verdash_origem = 'nativa';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.fn_marcar_limpeza_nativa(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_marcar_limpeza_nativa(uuid, uuid, boolean)
  to service_role;

notify pgrst, 'reload schema';
