-- 9006_o_upstream_apagou_nossos_canais
--
-- Forward-fix obrigatório depois do merge da v1.41.0. Sem esta migration, aplicar a
-- cadeia do upstream em produção DERRUBA os canais `verdash` e `instagram`.
--
-- ─── O QUE ACONTECEU ────────────────────────────────────────────────────────
--
-- A migration `20260921030000_0368_redes_sociais_nativas.sql`, do upstream, reconstrói
-- dois CHECK com lista FIXA:
--
--   alter table public.channel_sessions drop constraint if exists channel_sessions_provider_check;
--   alter table public.channel_sessions add constraint channel_sessions_provider_check
--     check (provider in ('waha', 'meta_cloud', 'zernio', 'zernio_social', 'wacalls'));
--
-- Do lado do upstream isso é correto e completo: são todos os providers que existem lá.
-- Num FORK, é um apagador. Nossas migrations 9001 e 9004 rodam ANTES (16 e 18/09); a 0368
-- roda depois (21/09) e leva `verdash` e `instagram` embora junto com o CHECK antigo.
--
-- O efeito não é erro na hora da migration — é erro DEPOIS, no primeiro uso: conectar um
-- canal da Verdash passa a bater `23514 check constraint violation`, e a mensagem que
-- chega pelo webhook do Instagram para de ser aceita. O canal do cliente morre calado.
--
-- ─── COMO FOI ENCONTRADO ────────────────────────────────────────────────────
--
-- Pelo `check-do-baseline-nao-diverge-da-cadeia.test.ts`, um teste NOVO que veio no
-- próprio merge. Ele simula a cadeia de migrations arquivo a arquivo e compara o
-- vocabulário resultante com o que o `baseline.sql` declara. Acusou:
--
--   channel_sessions_provider_check      — na cadeia (0368) falta: instagram, verdash
--   channel_sessions_provider_ref_check  — na cadeia (0368) falta: instagram, verdash
--
-- Sem esse teste, o defeito só apareceria na VPS30 depois de aplicar as 69 migrations,
-- com o canal do cliente fora do ar e a causa a 69 arquivos de distância.
--
-- ─── POR QUE AQUI A LISTA É LITERAL, E NAS 9001/9004 NÃO ────────────────────
--
-- A 9001 e a 9004 reconstroem os CHECK de forma ADITIVA, derivando a definição atual de
-- `pg_get_constraintdef` e acrescentando o provider novo por `execute format`. A razão
-- está escrita lá: assim a migration não precisa saber quantos providers existem, e não
-- apaga um que o upstream venha a acrescentar depois.
--
-- Aqui a lista é literal, e a diferença é deliberada. O teste acima simula a cadeia
-- LENDO o SQL: ele enxerga `add constraint X check (…)` com literais dentro e não tem como
-- enxergar uma lista montada em tempo de execução. Uma 9006 aditiva ficaria invisível para
-- ele — o `drop` literal seria visto, o `add` dentro do `format` não, e o gate passaria a
-- acusar uma constraint que na prática está correta. Um gate que dá falso vermelho é um
-- gate que alguém desliga.
--
-- E o motivo que justificava o aditivo enfraquece justamente por causa dele: o risco era
-- apagar um provider do upstream EM SILÊNCIO. Com este teste rodando no `test:unit`, o
-- silêncio acabou. Se a próxima release trouxer um provider novo e esta lista não o
-- conhecer, o gate reprova antes do deploy, e a resposta é outra forward-fix como esta.
--
-- A troca, portanto: lista literal que um teste sabe ler, em vez de técnica esperta que
-- nenhum teste alcança.
--
-- ─── E ELA VAI PRECISAR DE IRMÃS ────────────────────────────────────────────
--
-- Toda release do upstream que reconstrua um CHECK com lista fixa vai apagar os nossos de
-- novo. Quem subir o fork da próxima vez: se o gate reprovar, a resposta é uma migration
-- como esta. Editar a migration do upstream é proibido — ela já rodou na base de quem
-- acompanha o upstream, e mexer nela faz o mesmo arquivo significar duas coisas.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. O CHECK DE PROVIDER DAS SESSÕES ─────────────────────────────────────
--
-- O `if` evita o drop+add quando a constraint já conhece os dois: numa base que aplicou
-- a 9001/9004 e ainda não recebeu a 0368, não há nada a fazer.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.channel_sessions'::regclass
       and conname  = 'channel_sessions_provider_check'
       and pg_get_constraintdef(oid) like '%''instagram''%'
  ) then
    alter table public.channel_sessions drop constraint if exists channel_sessions_provider_check;
    alter table public.channel_sessions add constraint channel_sessions_provider_check
      check (provider in ('waha', 'meta_cloud', 'zernio', 'zernio_social', 'wacalls', 'verdash', 'instagram'));
  end if;
end $$;

-- ─── 2. O CHECK DE ENDEREÇAMENTO ────────────────────────────────────────────
--
-- Cada provider precisa da SUA coluna de endereçamento preenchida — é o que impede uma
-- sessão existir sem saber para onde mandar. Os dois nossos usam `verdash_instance_name`:
-- o transporte passa pela mesma plataforma, o que muda é o canal, não o caminho.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.channel_sessions'::regclass
       and conname  = 'channel_sessions_provider_ref_check'
       and pg_get_constraintdef(oid) like '%''instagram''%'
  ) then
    alter table public.channel_sessions drop constraint if exists channel_sessions_provider_ref_check;
    alter table public.channel_sessions add constraint channel_sessions_provider_ref_check check (
      (provider = 'waha' and waha_session_name is not null) or
      (provider = 'meta_cloud' and meta_phone_number_id is not null) or
      (provider in ('zernio', 'zernio_social') and zernio_account_id is not null) or
      (provider = 'wacalls' and wacalls_session_id is not null) or
      (provider in ('verdash', 'instagram') and verdash_instance_name is not null)
    );
  end if;
end $$;

-- ─── 3. O ARQUIVO DE WEBHOOK — a tabela que a 9002 ensinou a não esquecer ───
--
-- Duas tabelas, dois CHECK separados. A 9002 nasceu porque isto foi esquecido uma vez: o
-- canal entrou no CHECK das sessões, funcionou, e o arquivo recusou 5 de 5 entregas em
-- silêncio — o insert é best-effort de propósito, para que falha de arquivo nunca derrube
-- a mensagem de um cliente. A 0368 não toca nesta tabela, mas conferir custa um `do $$`
-- e o dia em que ela tocar não vai avisar.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.webhook_events_log'::regclass
       and conname  = 'webhook_events_log_provider_check'
       and pg_get_constraintdef(oid) like '%''instagram''%'
  ) then
    alter table public.webhook_events_log drop constraint if exists webhook_events_log_provider_check;
    alter table public.webhook_events_log add constraint webhook_events_log_provider_check
      check (provider in ('waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'verdash', 'instagram'));
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
