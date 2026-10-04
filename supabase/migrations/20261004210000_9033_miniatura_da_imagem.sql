-- 9033: a imagem recebida ganha MINIATURA, e a miniatura sai junto com a original.
--
-- ## Por quê
--
-- A lista da conversa desenhava a foto inteira (às vezes vários MB) numa caixa
-- de ~256 px. O worker de mídia (`workers/media-persist-worker.ts`) passa a
-- gravar, ao lado da original, uma versão webp com lado maior de 512 px (telas
-- 2x) em `{org}/miniaturas/{conversa}/{mensagem}.webp`, e o caminho fica em
-- `messages.media_thumb_path`. A lista assina e mostra a miniatura; o clique
-- abre a original. Mensagem sem miniatura (antiga, ou imagem que já era
-- pequena) continua com a original.
--
-- ## Isolamento
--
-- O caminho da miniatura fica DENTRO da pasta da organização da própria linha:
-- `messages_media_thumb_path_da_org` recusa qualquer outro prefixo. `NOT VALID`
-- porque a coluna nasce vazia (nada a validar) e validar varreria `messages`
-- inteira segurando lock; a regra vale para toda escrita a partir daqui.
--
-- ## A miniatura sai com a original (LGPD e retenção)
--
-- Toda saída da original passa por UPDATE de `media_storage_path` (a cascata de
-- anonimização `fn_lgpd_cascade_redact_contact`, a poda `fn_enfileirar_midia_vencida`)
-- ou por DELETE da linha (conversa apagada). Uma trigger nas duas pontas põe a
-- miniatura na MESMA fila (`storage_redaction_queue`, bucket `whatsapp-media`)
-- e zera o ponteiro. Assim nenhuma das funções grandes precisou ser copiada e
-- reescrita, e qualquer caminho futuro que remova a original leva a miniatura.
-- A pasta `miniaturas/` fica fora do varredor de órfãos da 0432/0435 (ele só
-- olha `org/<uuid>/…` e `org/avatars/…`), então miniatura em uso nunca é tomada
-- por órfã.
--
-- Organização sendo apagada: a fila tem FK para `organizations`, e a linha da
-- organização já não existe quando a cascata chega em `messages`. A trigger
-- pula esse caso em vez de derrubar a remoção da organização (o varredor de
-- órfãos também não alcança organização apagada — mesmo comportamento da
-- original).
--
-- Prova: tests/invariants/miniatura-sai-com-a-original.test.ts.

set local lock_timeout = '3s';

alter table public.messages add column if not exists media_thumb_path text;

comment on column public.messages.media_thumb_path is
  'Miniatura webp (lado maior 512 px) da imagem, no bucket whatsapp-media, em {org}/miniaturas/{conversa}/{mensagem}.webp. Null = sem miniatura: a tela usa a original. Sai junto com a original (trg_miniatura_sai_com_a_original_*). Migration 9033.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'messages_media_thumb_path_da_org'
       and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_media_thumb_path_da_org
      check (media_thumb_path is null or media_thumb_path like organization_id::text || '/%')
      not valid;
  end if;
end $$;

create or replace function public.fn_miniatura_sai_com_a_original()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Organização sendo apagada: a fila não aceita linha dela (FK), e o arquivo
  -- da organização apagada não é varrido por ninguém — igual à original.
  if exists (select 1 from public.organizations o where o.id = old.organization_id) then
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    values (old.organization_id, 'whatsapp-media', old.media_thumb_path)
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      -- Linha em curso (a da LGPD, com o request_id do pedido) fica como está.
      where storage_redaction_queue.status in ('deleted', 'skipped');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  new.media_thumb_path := null;
  return new;
end;
$$;

revoke all on function public.fn_miniatura_sai_com_a_original() from public, anon, authenticated;

create trigger trg_miniatura_sai_com_a_original_upd
  before update of media_storage_path on public.messages
  for each row
  when (old.media_thumb_path is not null
        and new.media_storage_path is distinct from old.media_storage_path)
  execute function public.fn_miniatura_sai_com_a_original();

create trigger trg_miniatura_sai_com_a_original_del
  before delete on public.messages
  for each row
  when (old.media_thumb_path is not null)
  execute function public.fn_miniatura_sai_com_a_original();

notify pgrst, 'reload schema';
