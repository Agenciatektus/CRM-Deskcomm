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
-- O varredor de órfãos da 0432/0435 passa a contar `media_thumb_path` como
-- referência (ver o fim deste arquivo): miniatura em uso nunca é tomada por
-- órfã, e miniatura sem ponteiro sai.
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

-- ## Só o servidor grava o caminho da mídia (P2-2 do @Cassio_SecRev na #75)
--
-- `messages_update` só exige tenancy. Sem esta guarda, um VIEWER apontaria
-- `media_thumb_path` para qualquer objeto da organização (o CHECK só exige a
-- pasta da org) e, ao mexer em `media_storage_path` ou apagar a linha, faria a
-- trigger definer acima enfileirar a EXCLUSÃO desse objeto. Quem grava esses
-- caminhos é o worker e as rotas com o cliente admin (service_role); a sessão
-- do navegador (`authenticated`) nunca. O INSERT da sessão continua podendo
-- trazer `media_storage_path` (o anexo que o atendente envia), mas não miniatura.
-- Função SECURITY INVOKER de propósito: `current_user` tem de ser quem chamou.
-- Função definer do próprio banco (a cascata LGPD, a poda) roda como o dono e
-- passa. Por trigger, e não por GRANT de coluna: revogar o UPDATE da tabela e
-- conceder coluna a coluna mexeria em toda escrita de `messages` da sessão.
create or replace function public.fn_midia_so_pelo_servidor()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.media_thumb_path is not null then
      raise exception 'media_thumb_path só é gravado pelo servidor'
        using errcode = '42501';
    end if;
  elsif new.media_thumb_path is distinct from old.media_thumb_path
     or new.media_storage_path is distinct from old.media_storage_path then
    raise exception 'o caminho da mídia (media_storage_path/media_thumb_path) só é alterado pelo servidor'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_midia_so_pelo_servidor
  before insert or update of media_thumb_path, media_storage_path on public.messages
  for each row
  execute function public.fn_midia_so_pelo_servidor();

-- ## O varredor de órfãos conta a miniatura como referência (P2-3)
--
-- Em vez de ignorar a pasta `miniaturas/` inteira, o passo 2 de
-- `fn_enfileirar_midia_vencida` passa a varrê-la e a tratar `media_thumb_path`
-- como referência: miniatura sem ponteiro (upload sem a linha gravada) vira
-- órfã. Corpo copiado da ÚLTIMA definição (0483, já no baseline); só o passo 2
-- muda.
create or replace function public.fn_enfileirar_midia_vencida(p_limite integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_lim integer := greatest(1, least(coalesce(p_limite, 500), 5000));
  v_vencidas integer := 0;
  v_orfas integer := 0;
  -- Órfãos do bucket PRÓPRIO da nota interna (0483). Contam em `v_orfas`:
  -- é a mesma categoria — arquivo sem ponteiro — e a chave de retorno não
  -- muda (o `toEqual` congelado de `poda-de-midia.test.ts` mede as três).
  v_orfas_nota integer := 0;
  -- O que o expurgo apagou NESTA chamada (#1765). Começa em 0 para que a
  -- rodada sem nada a expurgar devolva 0 — e não null, que o cron somaria
  -- como se fosse apagado.
  v_expurgadas integer := 0;
  -- Janela do expurgo, em UM lugar só: é a constante que se muda amanhã.
  v_janela_deleted interval := interval '90 days';
begin
  -- 0. EXPURGO: a linha `deleted` da RETENÇÃO já cumpriu o papel (o arquivo
  --    saiu do bucket) e nada mais precisa dela — sem isto a fila cresce sem
  --    teto (#1739, item 2). Só `deleted`: `skipped` é «o objeto já não
  --    existe», `failed` é a prova de uma remoção que nunca passou das 3
  --    tentativas, e a issue manda não mexer em nenhuma das duas.
  --    E só a de retenção (`request_id is null`): a linha de pedido LGPD é o
  --    ÚNICO registro por objeto de que a mídia do titular saiu do bucket — o
  --    worker só troca o `status` e nada audita a remoção física. Ela sai
  --    sozinha se o pedido for apagado (FK `on delete set null`).
  --    O `GET DIAGNOSTICS` conta o que o DELETE apagou NESTA chamada (#1765):
  --    sem ele a rodada que só expurgou é indistinguível, na trilha, da rodada
  --    que não tinha o que fazer.
  delete from public.storage_redaction_queue
   where status = 'deleted'
     and request_id is null
     and coalesce(processed_at, enqueued_at) < now() - v_janela_deleted;
  get diagnostics v_expurgadas = row_count;

  -- 1. VENCIDAS: arquivo de mensagem mais velho que a retenção da organização.
  --    A mensagem fica (texto, status, horário); só o arquivo sai, e a tela
  --    mostra «Mídia indisponível». O piso de 30 dias é o mesmo do formulário.
  with alvo as (
    select m.id, m.organization_id, m.media_storage_path as caminho
      from public.messages m
      join public.organizations o on o.id = m.organization_id
     where m.media_storage_path is not null
       and m.created_at < now() - make_interval(days => greatest(coalesce(o.media_retention_days, 365), 30))
     order by m.created_at
     limit v_lim
     for update of m skip locked
  ), fila as (
    -- O arquivo só vai para a fila quando nenhuma OUTRA mensagem o usa: a foto
    -- de catálogo tem caminho fixo por conversa e é reaproveitada a cada
    -- reenvio (`fotos-do-produto.ts`), então a mensagem de ontem pode apontar
    -- para o mesmo arquivo da vencida. A vencida perde o caminho do mesmo
    -- jeito; o arquivo sai quando a última referência vencer (aqui) ou no
    -- passo 2, como órfão.
    --
    -- O `do update` é o conserto do #1739: se aquele caminho já saiu da fila
    -- (`deleted`) ou o objeto já nem existia (`skipped`), um arquivo NOVO pode
    -- estar gravado ali agora — e o `do nothing` da 0432 engolia este pedido
    -- silenciosamente, deixando o arquivo novo fora da retenção PARA SEMPRE.
    -- O `where` é a outra metade do conserto: `pending`/`failed` em curso não
    -- são interrompidos (uma remoção em andamento não perde a tentativa).
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select distinct a.organization_id, 'whatsapp-media', a.caminho
      from alvo a
     where not exists (
       select 1 from public.messages m2
        where m2.media_storage_path = a.caminho
          and m2.id not in (select id from alvo)
     )
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  ), limpas as (
    update public.messages m
       set media_storage_path = null, updated_at = now()
      from alvo
     where m.id = alvo.id
    returning 1
  )
  select count(*) into v_vencidas from limpas;

  -- 2. ÓRFÃOS: arquivo que nada no banco aponta — o rastro de conversa apagada.
  --    Só as duas pastas que o CRM grava por mensagem e por contato:
  --    `org/<conversa>/…` e `org/avatars/…`. `org/templates/…` (cabeçalho de
  --    modelo) NUNCA entra: quem o usa guarda o link, não o caminho. Um dia de
  --    carência cobre o envio que sobe o arquivo antes de gravar a mensagem.
  with orfaos as (
    select o.name as caminho, split_part(o.name, '/', 1)::uuid as org
      from storage.objects o
     where o.bucket_id = 'whatsapp-media'
       and o.created_at < now() - interval '1 day'
       and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (select 1 from public.organizations g where g.id::text = split_part(o.name, '/', 1))
       and (
         split_part(o.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or split_part(o.name, '/', 2) = 'avatars'
         -- Miniatura da imagem (9033): `org/miniaturas/<conversa>/…`. Conta como
         -- referência o `media_thumb_path`, e não a pasta inteira ignorada:
         -- miniatura sem ponteiro (upload sem a linha gravada) é órfã como
         -- qualquer outra (P2-3 do @Cassio_SecRev na #75).
         or (split_part(o.name, '/', 2) = 'miniaturas'
             and split_part(o.name, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       )
       and not exists (select 1 from public.messages m where m.media_storage_path = o.name)
       and not exists (select 1 from public.messages m where m.media_thumb_path = o.name)
       and not exists (select 1 from public.contacts c where c.avatar_storage_path = o.name)
       -- Só linha EM CURSO segura o caminho (`pending`, ou `failed` que ainda
       -- é o registro de uma remoção não feita). Linha `deleted`/`skipped`
       -- NÃO bloqueia mais: é justamente o caso do avatar reaproveitado
       -- (#1739) — o objeto novo no caminho antigo tinha de chegar no conflito
       -- lá embaixo para ser reaberto, e este `not exists` o engolia antes.
       and not exists (
         select 1 from public.storage_redaction_queue q
          where q.bucket = 'whatsapp-media' and q.object_path = o.name
            and q.status not in ('deleted', 'skipped')
       )
     limit v_lim
  ), fila as (
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select org, 'whatsapp-media', caminho from orfaos
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  )
  select count(*) into v_orfas from fila;


  -- 2b. ÓRFÃOS DA NOTA INTERNA (migration 0483): o passo 2 varre SÓ o bucket
  --     `whatsapp-media` (filtro `bucket_id`), então um anexo de nota nunca
  --     entraria na conta — e a nota que o atendente apagou deixaria o arquivo
  --     para sempre no `internal-media`, custo que só cresce. Mesmo desenho do
  --     passo 2, com as duas pontas certas: bucket `internal-media` e
  --     `conversation_notes.media_storage_path` como a referência que segura o
  --     caminho. Um dia de carência cobre o upload que sobe ANTES de a nota ser
  --     gravada (é a ordem do composer), como o passo 2 cobre o envio.
  --     Uma linha `pending`/`failed` em curso segura o caminho; `deleted`/
  --     `skipped` não, pelo mesmo motivo escrito no passo 2 (caminho reuso).
  with orfaos_da_nota as (
    select o.name as caminho, split_part(o.name, '/', 1)::uuid as org
      from storage.objects o
     where o.bucket_id = 'internal-media'
       and o.created_at < now() - interval '1 day'
       and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (select 1 from public.organizations g where g.id::text = split_part(o.name, '/', 1))
       and split_part(o.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (
         select 1 from public.conversation_notes n where n.media_storage_path = o.name
       )
       and not exists (
         select 1 from public.storage_redaction_queue q
          where q.bucket = 'internal-media' and q.object_path = o.name
            and q.status not in ('deleted', 'skipped')
       )
     limit v_lim
  ), fila_da_nota as (
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select org, 'internal-media', caminho from orfaos_da_nota
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  )
  select count(*) into v_orfas_nota from fila_da_nota;
  v_orfas := v_orfas + v_orfas_nota;
  return jsonb_build_object('vencidas', v_vencidas, 'orfas', v_orfas, 'expurgadas', v_expurgadas);
end;
$$;

revoke execute on function public.fn_enfileirar_midia_vencida(integer) from public, anon, authenticated;
grant execute on function public.fn_enfileirar_midia_vencida(integer) to service_role;

notify pgrst, 'reload schema';
