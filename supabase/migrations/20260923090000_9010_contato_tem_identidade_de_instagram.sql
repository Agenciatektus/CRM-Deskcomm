-- 9010 — o contato ganha identidade de Instagram, com a mesma dignidade do telefone.
--
-- ─── Por que uma COLUNA, e não `source_metadata` ────────────────────────────
-- O Instagram não é uma pista sobre um contato de WhatsApp: é uma FONTE DE LEAD
-- inteira. Uma pessoa pode existir só no Instagram, só no WhatsApp, ou nos dois,
-- e o desenho tem de tratar os três casos como normais.
--
-- `source_metadata` é um saco de contexto — bom para "de qual anúncio veio",
-- ruim para identidade. Identidade precisa de três coisas que JSONB não dá de
-- graça: unicidade garantida pelo banco, índice que a busca usa, e um lugar
-- óbvio onde o próximo programador procura. As três colunas de identidade que
-- já existem (`phone_number`, `email_normalized`, `cpf_hash`) são colunas com
-- índice único parcial, e esta entra na mesma prateleira.
--
-- ─── O `where is_merged_into is null` não é detalhe ─────────────────────────
-- É o que permite a FUSÃO existir. O contato perdedor vira lápide e sai do
-- índice, liberando o IGSID para o vencedor herdar. Sem o parcial, fundir dois
-- contatos que têm Instagram falharia por violação de unicidade justamente no
-- caso que a fusão existe para resolver.
--
-- ─── IGSID e @ são coisas diferentes ────────────────────────────────────────
-- O `instagram_igsid` é o id estável que a Meta dá ao par (conta, pessoa). O
-- `instagram_username` é o @, que a pessoa TROCA quando quer. Guardar os dois e
-- identificar pelo primeiro é o que evita perder o histórico de alguém que
-- mudou de @ — e é por isso que a unicidade está no IGSID, não no nome.

alter table public.contacts
  add column if not exists instagram_igsid text,
  add column if not exists instagram_username text;

create unique index if not exists contacts_instagram_igsid_key
  on public.contacts (organization_id, instagram_igsid)
  where instagram_igsid is not null and is_merged_into is null;

-- Busca por @ na tela de contatos. Não é único de propósito: dois cadastros
-- podem carregar o mesmo @ enquanto ninguém os fundiu, e recusar isso no banco
-- transformaria "a pessoa trocou de @" num erro que o atendente não sabe
-- resolver.
create index if not exists contacts_instagram_username_idx
  on public.contacts (organization_id, lower(instagram_username))
  where instagram_username is not null and is_merged_into is null;

comment on column public.contacts.instagram_igsid is
  'Id estável do par (conta, pessoa) que a Meta emite. É a identidade; o @ muda, este não.';
comment on column public.contacts.instagram_username is
  'O @ no momento da última mensagem. Para exibir e buscar — nunca para identificar.';

-- ═══════════════════════════════════════════════════════════════════════════
--  Coluna de identidade nova entra em TRÊS lugares, não em um.
--
--  A primeira versão desta migration criou a coluna e o índice e parou. A
--  curadoria do @Cassio_SecRev mostrou que faltavam dois — e que os dois falham
--  em silêncio, com o sistema respondendo "deu certo":
--
--    1. o índice único parcial          ✔ estava
--    2. a HERANÇA na fusão de contatos  ✘ faltava (P1-3)
--    3. o APAGAMENTO da LGPD            ✘ faltava (P1-2)
--
--  Vale como regra para a próxima coluna de identidade que alguém criar aqui.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Guarda das âncoras: EXATAMENTE uma, nunca "pelo menos uma" ────────────
--
-- `position(... ) = 0` prova que a âncora existe. Não prova que ela é única —
-- e `replace()` no Postgres é replace-ALL. Se uma redefinição futura
-- introduzir uma segunda ocorrência (a cascata de LGPD zera PII em várias
-- tabelas: um segundo `phone_number = null,` é plausível), o patch é injetado
-- nos DOIS lugares.
--
-- E aí vem a parte ruim: o validador de `plpgsql` faz checagem SINTÁTICA e não
-- resolve nome de coluna, então o `create or replace` PASSA. A função só
-- explode no dia em que alguém exercer um apagamento de LGPD de verdade.
--
-- Levantado por @Cassio_SecRev na segunda passada.
create or replace function public.fn_9010_ancora_unica(p_def text, p_ancora text, p_onde text)
returns void
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_ancora, ''))) / length(p_ancora);
  if v_n <> 1 then
    raise exception
      '9010: a ancora de % aparece % vez(es) na definicao vigente (esperado exatamente 1). A funcao mudou de forma — releia antes de remendar.',
      p_onde, v_n;
  end if;
end $fn$;

revoke execute on function public.fn_9010_ancora_unica(text, text, text) from public, anon, authenticated;

-- ─── 2 · A fusão precisa HERDAR o IGSID ────────────────────────────────────
--
-- O comentário no topo desta migration dizia que o vencedor herda o IGSID da
-- lápide. Ele não herdava: `fn_mesclar_contatos` herda nome, apelido,
-- nascimento, e-mail, telefone, tags e o `waha_lid` — e mais nada.
--
-- O efeito: funde-se o contato do Instagram com o do WhatsApp, o IGSID fica na
-- lápide, e a próxima DM daquela pessoa não acha ninguém (a busca filtra
-- `is_merged_into is null`) e CRIA UM CONTATO NOVO, refazendo a duplicata que o
-- operador acabou de desfazer. É exatamente o modo de falha que a própria
-- função já documenta para o `waha_lid`, e que por isso o herda.
--
-- Feito por ÂNCORA sobre a definição vigente, e não recopiando a função: ela é
-- do upstream e tem mais de cem linhas. Se o bloco mudar de forma, esta
-- migration FALHA ALTO em vez de aplicar um remendo no lugar errado.
do $mig$
declare
  v_def text;
  v_ancora text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_mesclar_contatos';

  if v_def is null then
    raise notice '9010: fn_mesclar_contatos nao existe nesta instalacao — heranca fica para quem a tiver';
    return;
  end if;

  if position('v_igsid' in v_def) > 0 then
    raise notice '9010: a fusao ja herda o IGSID — nada a fazer';
    return;
  end if;

  v_ancora := '  v_lid text;';
  perform public.fn_9010_ancora_unica(v_def, v_ancora, 'declaracao de v_lid em fn_mesclar_contatos');

  v_def := replace(
    v_def,
    v_ancora,
    v_ancora || chr(10) || '  v_igsid text;' || chr(10) || '  v_username text;'
  );

  -- Colhe do perdedor mais antigo, como os outros campos fazem, e reusa a
  -- guarda de unicidade: a lápide já soltou o IGSID do índice, então o que
  -- sobrar aqui é conflito com um TERCEIRO contato vivo — e nesse caso o
  -- vencedor simplesmente não herda, em vez de a fusão inteira falhar.
  v_ancora := '  select coalesce(array_agg(distinct t)';
  perform public.fn_9010_ancora_unica(v_def, v_ancora, 'bloco de tags em fn_mesclar_contatos');

  v_def := replace(
    v_def,
    v_ancora,
    '  select c.instagram_igsid into v_igsid from public.contacts c' || chr(10) ||
    '   where c.id = any(p_contatos_secundarios) and c.instagram_igsid is not null' || chr(10) ||
    '   order by c.created_at, c.id limit 1;' || chr(10) ||
    '  select c.instagram_username into v_username from public.contacts c' || chr(10) ||
    '   where c.id = any(p_contatos_secundarios) and c.instagram_username is not null' || chr(10) ||
    '   order by c.created_at, c.id limit 1;' || chr(10) ||
    '  if v_igsid is not null and exists (' || chr(10) ||
    '    select 1 from public.contacts o' || chr(10) ||
    '     where o.organization_id = p_organization_id and o.is_merged_into is null' || chr(10) ||
    '       and o.id <> p_contato_principal and o.instagram_igsid = v_igsid' || chr(10) ||
    '  ) then v_igsid := null; end if;' || chr(10) ||
    '  -- Abre a escotilha da trigger de identidade para ESTA transacao. Sem' || chr(10) ||
    '  -- isto a heranca logo abaixo levanta 42501 e a fusao inteira aborta:' || chr(10) ||
    '  -- SECURITY DEFINER troca o papel e NAO troca auth.uid().' || chr(10) ||
    '  perform set_config(''deskcomm.identidade_de_instagram'', ''on'', true);' || chr(10) ||
    v_ancora
  );

  -- Escreve no vencedor. `coalesce` porque o principal MANDA: ele herda só o
  -- que não tinha, nunca sobrescreve o que o atendente digitou.
  v_ancora := '    phone_number = coalesce(phone_number, v_telefone),';
  perform public.fn_9010_ancora_unica(v_def, v_ancora, 'update do vencedor em fn_mesclar_contatos');

  v_def := replace(
    v_def,
    v_ancora,
    v_ancora || chr(10) ||
    '    instagram_igsid = coalesce(instagram_igsid, v_igsid),' || chr(10) ||
    '    instagram_username = coalesce(instagram_username, v_username),'
  );

  -- FECHA a escotilha logo depois do uso.
  --
  -- `set_config(..., true)` e TRANSACAO-local, nao statement-local. Deixada
  -- aberta, ela vale pelo resto da transacao — e qualquer escrita posterior no
  -- mesmo request passaria pela trava. Medido no ensaio: sem este reset, um
  -- `update contacts set instagram_igsid` logo apos a fusao era ACEITO.
  --
  -- A janela certa e a menor possivel: abre antes do update do vencedor, fecha
  -- depois dele.
  v_ancora := '  -- 7 · A fusão aparece na timeline';
  perform public.fn_9010_ancora_unica(v_def, v_ancora, 'inicio do passo 7 em fn_mesclar_contatos');

  v_def := replace(
    v_def,
    v_ancora,
    '  perform set_config(''deskcomm.identidade_de_instagram'', ''off'', true);' || chr(10) ||
    v_ancora
  );

  execute v_def;
end $mig$;

-- ─── 3 · O apagamento da LGPD precisa ALCANÇAR as colunas novas ────────────
--
-- `wa_identity` e `wa_lid` escapam da cascata porque são GERADAS a partir de
-- `phone_number` — zerar o telefone as zera por derivação. As duas colunas
-- desta migration são PLANAS: nada as limpa.
--
-- Sem isto, o titular exerce o direito de eliminação (LGPD art. 18, VI), a rota
-- devolve SUCESSO, os contadores fecham — e a linha segue carregando o `@` da
-- pessoa, que é identificador direto, e o IGSID, que é o id estável que a Meta
-- emite para ela. Mesma classe do defeito que a 9008 acabou de consertar em
-- `voice_calls.transcript`: falha silenciosa com recibo de conformidade por
-- cima. Criar PII antes de ensinar o apagamento a alcançá-la é abrir a janela
-- de propósito.
do $mig$
declare
  v_def text;
  v_ancora text := '    phone_number = null,';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_lgpd_cascade_redact_contact';

  if v_def is null then
    raise notice '9010: cascata de LGPD nao existe nesta instalacao';
    return;
  end if;

  if position('instagram_igsid = null' in v_def) > 0 then
    raise notice '9010: a cascata ja apaga a identidade de Instagram';
    return;
  end if;

  perform public.fn_9010_ancora_unica(v_def, v_ancora, 'apagamento na cascata de LGPD');

  -- A cascata roda pelo ADMIN (`lib/lgpd/redact-cascade.ts`), então `auth.uid()`
  -- é null lá dentro e a trigger de identidade já a deixa passar. Não precisa
  -- de escotilha — e acrescentar uma que não é exercida seria guarda morta.
  execute replace(
    v_def,
    v_ancora,
    v_ancora || chr(10) ||
    '    instagram_igsid = null,' || chr(10) ||
    '    instagram_username = null,'
  );
end $mig$;

-- ─── 4 · Quem pode ESCREVER a identidade ───────────────────────────────────
--
-- `tenant_isolation_contacts_all` autoriza por VÍNCULO com a organização e não
-- consulta papel. Isso já foi medido neste repositório: um `viewer` — o papel
-- que a tela chama de "Somente leitura" — gravou `first_service_at` pelo
-- PostgREST e recebeu `UPDATE 1`.
--
-- `instagram_igsid` nasce dentro dessa policy. O ataque concreto é gravar o
-- IGSID de outra pessoa num contato que se controla: a próxima conversa
-- daquela pessoa cola no contato errado, ou o upsert legítimo bate no índice
-- único e o atendimento entra em contato duplicado. É roteamento de atendimento
-- decidido pelo papel mais fraco da organização.
--
-- Trigger, e não `revoke update` + `grant update (<lista>)`, pelo mesmo motivo
-- já escrito em `fn_colunas_de_cliente_sao_do_sistema`: a lista de colunas
-- concedidas envelhece em silêncio a cada coluna nova, e no dia em que alguém
-- esquecer de acrescentá-la a tela para de salvar sem dizer por quê.
-- SEM `security definer`, de propósito: o padrão-irmão que esta função copia
-- (`fn_colunas_de_cliente_sao_do_sistema`) também não o tem. O corpo só lê
-- `NEW`/`OLD` e levanta exceção — não toca tabela, não monta SQL dinâmico —,
-- então o privilégio não compra nada e só ampliaria em silêncio o que uma
-- edição futura desta função poderia fazer. Least privilege (@Cassio_SecRev).
create or replace function public.fn_identidade_de_instagram_e_do_sistema()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  -- `auth.uid() is null` é a ingestão rodando com service role: ela PRECISA
  -- escrever, é ela quem descobre o IGSID. A trava é para sessão de gente.
  if auth.uid() is null then
    return new;
  end if;

  -- ─── A ESCOTILHA, e por que ela NÃO é um buraco ──────────────────────────
  --
  -- `SECURITY DEFINER` troca o PAPEL e não troca `auth.uid()`: a GUC que o
  -- PostgREST setou continua lá dentro. E `fn_mesclar_contatos` roda com o
  -- cliente do USUÁRIO de propósito (está escrito na rota: é assim que
  -- `auth.uid()` chega à função para ela reconferir o papel e assinar a
  -- atividade na timeline).
  --
  -- Sem esta escotilha os dois consertos desta migration se anulam: a herança
  -- do IGSID muda a coluna, esta trava levanta 42501, e A FUSÃO INTEIRA ABORTA
  -- — exatamente e somente quando a herança teria efeito. Medido num Postgres
  -- com o dump de produção: manager real, vencedor sem IGSID, perdedor com,
  -- fusão recusada com a mensagem daqui de baixo.
  --
  -- A chave é de TRANSAÇÃO (`set_config(..., true)`) e não é alcançável de
  -- fora: o PostgREST não envia SQL solto, e `set_config` mora em `pg_catalog`,
  -- fora do schema exposto. É o mesmo mecanismo que
  -- `fn_colunas_de_cliente_sao_do_sistema` já usa nesta base, pelo mesmo
  -- motivo — e a lição dela é que não basta copiar a guarda: a escotilha é o
  -- que faz o padrão funcionar.
  --
  -- A alternativa preguiçosa seria deixar `null -> valor` passar livre. Não
  -- serve: é o ataque principal (um `viewer` grava IGSID num contato que ainda
  -- não tem nenhum, e a próxima conversa daquela pessoa cola no contato dele).
  if coalesce(current_setting('deskcomm.identidade_de_instagram', true), '') = 'on' then
    return new;
  end if;

  if new.instagram_igsid is distinct from old.instagram_igsid then
    raise exception using
      errcode = '42501',
      message = 'a identidade de Instagram do contato e escrita pelo sistema, nao pela tela';
  end if;

  return new;
end $fn$;

revoke execute on function public.fn_identidade_de_instagram_e_do_sistema() from public, anon, authenticated;

drop trigger if exists trg_identidade_de_instagram_e_do_sistema on public.contacts;
-- `update of` + `when`: sem isto a trigger seria considerada em TODO update de
-- `contacts` — inclusive no bump de `last_activity_at` a cada mensagem, que é o
-- caminho mais quente do sistema. Com os dois filtros, ela nem é avaliada
-- quando a coluna não está no `SET`. Não substitui a escotilha da GUC: a fusão
-- passa pelos dois filtros e continuaria barrada sem ela.
create trigger trg_identidade_de_instagram_e_do_sistema
  before update of instagram_igsid on public.contacts
  for each row
  when (old.instagram_igsid is distinct from new.instagram_igsid)
  execute function public.fn_identidade_de_instagram_e_do_sistema();

notify pgrst, 'reload schema';
