-- manifest: 9068 — Verdash nativo (FZAP): fn_registrar_evento_conexao_nativa grava status e as chaves de conexao (ja_conectou_em, desconectado_em, evento_conexao_em) de channel_sessions.metadata NUMA instrucao, sob lock da linha, e recusa evento mais antigo que a ultima transicao. Substitui o ler-espalhar-regravar do CRM, que apagava ai_gate_mode, lista de teste e chaves da pausa se o operador salvasse entre a leitura e a escrita. Idempotente; apendice igual no baseline.sql.
--
-- Mesmo desenho de fn_configurar_pre_go_live_canal (0218) e fn_definir_pausa_de_canal:
-- security invoker, filtro por organization_id e archived_at is null, e SO as proprias
-- chaves entram no jsonb (`||` e `-`). Eventos: Connected, Disconnected, LoggedOut.

create or replace function public.fn_registrar_evento_conexao_nativa(
  p_org uuid,
  p_canal uuid,
  p_evento text,
  p_em timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.channel_sessions%rowtype;
  v_agora timestamptz := now();
  v_em timestamptz := coalesce(p_em, now());
  v_ultimo timestamptz;
  v_meta jsonb;
  v_status text;
begin
  if p_evento is null or p_evento not in ('Connected', 'Disconnected', 'LoggedOut') then
    raise exception 'evento de conexao invalido' using errcode = '22023';
  end if;

  -- Sob lock: um UPDATE concorrente do operador espera e a escrita abaixo parte da
  -- versao dele, em vez de regravar um metadata lido antes.
  select * into v_row
    from public.channel_sessions
   where organization_id = p_org
     and id = p_canal
     and archived_at is null
   for update;

  if not found then
    return jsonb_build_object('resultado', 'ignorado', 'motivo', 'canal_arquivado');
  end if;
  if v_row.verdash_origem is distinct from 'nativa' then
    return jsonb_build_object('resultado', 'ignorado', 'motivo', 'evento_sem_interesse');
  end if;

  -- Evento mais antigo que a ultima transicao nao desfaz o que veio depois.
  v_ultimo := coalesce(
    nullif(v_row.metadata ->> 'evento_conexao_em', '')::timestamptz,
    v_row.last_status_change_at
  );
  if v_ultimo is not null and v_em < v_ultimo then
    return jsonb_build_object('resultado', 'obsoleto', 'status', v_row.status);
  end if;

  v_meta := coalesce(v_row.metadata, '{}'::jsonb);
  if p_evento = 'Connected' then
    v_status := 'WORKING';
    v_meta := (v_meta - 'desconectado_em') || jsonb_build_object(
      'ja_conectou_em', coalesce(v_meta -> 'ja_conectou_em', to_jsonb(v_agora)));
  elsif p_evento = 'LoggedOut' then
    v_status := 'FAILED';
    v_meta := v_meta || jsonb_build_object(
      'ja_conectou_em', coalesce(v_meta -> 'ja_conectou_em', to_jsonb(v_agora)),
      'desconectado_em', coalesce(v_meta -> 'desconectado_em', to_jsonb(v_agora)));
  else
    -- Disconnected depois de FAILED/STOPPED nao "melhora" o canal para STARTING.
    v_status := case when v_row.status in ('FAILED', 'STOPPED') then v_row.status else 'STARTING' end;
    v_meta := v_meta || jsonb_build_object(
      'desconectado_em', coalesce(v_meta -> 'desconectado_em', to_jsonb(v_agora)));
  end if;
  v_meta := v_meta || jsonb_build_object('evento_conexao_em', to_jsonb(v_em));

  update public.channel_sessions
     set status = v_status,
         last_status_change_at = case
           when v_status is distinct from v_row.status then v_agora
           else last_status_change_at end,
         metadata = v_meta
   where organization_id = p_org
     and id = p_canal
     and archived_at is null;

  return jsonb_build_object(
    'resultado', 'aplicado',
    'status', v_status,
    'mudou', v_status is distinct from v_row.status,
    'display_name', v_row.display_name,
    'phone_number', v_row.phone_number,
    'instancia', v_row.verdash_instance_name
  );
end;
$$;

revoke execute on function public.fn_registrar_evento_conexao_nativa(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fn_registrar_evento_conexao_nativa(uuid, uuid, text, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
