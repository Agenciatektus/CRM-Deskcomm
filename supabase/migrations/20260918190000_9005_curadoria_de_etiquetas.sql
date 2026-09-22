-- ════════════════════════════════════════════════════════════════════════════
-- CURADORIA DO VOCABULÁRIO DE ETIQUETAS — a tela que faltava (migration 9005)
-- ════════════════════════════════════════════════════════════════════════════
--
-- O DEFEITO, medido nesta instalação em 18/09/2026:
--
--   organização "Agência Tektus" ....... 8 etiquetas canônicas de conversa
--   conversas com etiqueta ............. ZERO
--   contatos com etiqueta .............. 1122, em duas palavras
--                                        (`importado-whatsapp` 1121, `teste` 1)
--   vocabulário canônico de CONTATO .... não existe, em lugar nenhum do produto
--
-- Ou seja: as 8 sugestões que o seletor oferece não descrevem nada do que está
-- etiquetado, e as duas palavras que DE FATO existem no banco não são
-- oferecidas por ninguém. O operador vê `importado-whatsapp` na lista e não tem
-- como renomeá-la, mesclá-la nem promovê-la — só por SQL. A rota
-- `GET /api/v1/conversation-tags` já carrega esse diagnóstico escrito no corpo;
-- o que faltava era a ação.
--
-- Também é o estado das outras TRÊS organizações da instalação: nenhuma tem
-- sequer a chave `canonical_conversation_tags`. A semente é da instalação, não
-- da organização — quem nasce depois nasce sem vocabulário.
--
-- ─── DOIS VOCABULÁRIOS, E ELES CONTINUAM DOIS ───────────────────────────────
--
-- `conversations.tags` (a etiqueta do atendimento: dúvida, troca, urgente) e
-- `contacts.tags` (a etiqueta da pessoa: vip, inadimplente) são distintos de
-- propósito, e o comentário de `components/inbox/ContactTagsEditor.tsx` já diz
-- isso. Esta migration NÃO os unifica: cria para o de CONTATO o mesmo par de
-- chaves que o de conversa já tinha, e cura os dois lado a lado.
--
--   settings.canonical_conversation_tags   (já existia, spec 13 §3.3)
--   settings.archived_conversation_tags    (nova)
--   settings.canonical_contact_tags        (nova)
--   settings.archived_contact_tags         (nova)
--
-- TODAS são `array de text`, o mesmo formato da que já existia. Formato novo
-- (objeto com metadados, por exemplo) obrigaria `canonicalConversationTagsSchema`
-- e a rota a mudar de forma, e toda instalação que já gravou a chave passaria a
-- ler lixo — o `.catch([])` do Zod devolveria lista vazia e o seletor do Inbox
-- ficaria mudo sem ninguém entender por quê.
--
-- ─── ARQUIVAR NÃO É APAGAR, E A DIFERENÇA É O HISTÓRICO ─────────────────────
--
-- arquivar .... sai das sugestões, o dado fica. É reversível e não reescreve
--               nada. Quem tem a etiqueta continua tendo, e o filtro continua
--               encontrando.
-- apagar ...... sai do vocabulário E de todo registro que a usa. Não é
--               reversível, e por isso a tela mostra o contador ANTES.
--
-- Sem a distinção, "tirar da lista de sugestões" e "destruir o histórico"
-- seriam o mesmo botão — e o operador que só queria parar de oferecer `troca`
-- descobriria tarde demais qual dos dois tinha apertado.
--
-- ─── ⛔ A ETIQUETA `cliente` É RESERVADA, E ISTO NÃO É ZELO EXCESSIVO ────────
--
-- Na organização que ligou `settings.crm.cliente_pela_agenda` (migration 0262),
-- a etiqueta `cliente` de um CONTATO tem DONO, gravado em
-- `contacts.client_tag_by_system`: o sistema só tira a que ele mesmo pôs, e só
-- repõe a que ele mesmo tirou.
--
-- Duas coisas quebrariam se a curadoria a tocasse, e nenhuma das duas faria
-- barulho na hora:
--
-- 1. O `update` em massa muda `contacts.tags`, o que acorda
--    `trg_contato_colunas_de_cliente`. Lá dentro, "mexeu na presença de
--    `cliente` sem gravar o dono na MESMA escrita" zera `client_tag_by_system`
--    — de propósito, é como a remoção à mão passa a ser respeitada. Só que uma
--    curadoria toca centenas de contatos de uma vez: o efeito seria transferir
--    à equipe a posse da etiqueta em TODOS eles, silenciosamente. A partir daí
--    o sistema nunca mais tira `cliente` de ninguém, e um horário cancelado
--    deixa a etiqueta para trás para sempre.
--
-- 2. `'cliente'` é literal constante nas DUAS funções da 0262
--    (`fn_recalcular_cliente_do_contato:217` e
--    `fn_colunas_de_cliente_sao_do_sistema:401`). Renomear para `paciente` não
--    ensina nada a elas: o próximo horário marcado criaria `cliente` de novo,
--    ao lado de `paciente`, e o operador teria duas etiquetas para a mesma
--    coisa — exatamente a degradação que esta tela veio impedir.
--
-- Então, quando a regra está LIGADA, `cliente` recusa renomear, mesclar (como
-- origem ou como destino) e apagar, com `etiqueta_do_sistema`. A tela diz onde
-- desligar a regra. Desligada, a etiqueta é uma palavra comum e a curadoria a
-- trata como qualquer outra — porque aí ela é mesmo da equipe.
--
-- Arquivar continua valendo nos dois casos: arquivar não escreve em contato
-- nenhum, só para de sugerir.
--
-- ─── OS PAPÉIS, E POR QUE SÃO DOIS ──────────────────────────────────────────
--
-- A régua é a da casa, e ela já foi escrita duas vezes: `fn_agenda_settings` é
-- `manager` porque é configuração reversível que não reescreve dado;
-- `fn_definir_cliente_pela_agenda` é `admin` porque "ligar reescreve as
-- etiquetas de todo contato com histórico, e desligar não desfaz".
--
--   manager ... criar, arquivar, desarquivar. Nenhuma toca conversa ou contato.
--               Criar uma sugestão a mais é o preço de um clique errado.
--   admin ..... renomear, mesclar, apagar. As três reescrevem `tags` em massa e
--               nenhuma tem desfazer.
--
-- Um papel só para tudo erraria dos dois lados: `manager` em apagar entrega
-- destruição de histórico a quem o produto trata como operador; `admin` em
-- criar tira do gerente a única operação que ele faz toda semana, e manda
-- pedir ao dono da empresa para acrescentar a palavra `orçamento`.
--
-- ─── ESCRITA ATÔMICA EM `organizations.settings` ────────────────────────────
--
-- Toda escrita daqui é `jsonb_set` de UMA chave. Nunca `set settings = '...'`:
-- o objeto guarda `llm`, `routing`, `visibility_mode`, `atrito`,
-- `ai_dispatch_mode`, `lost_reasons_extra`, `plan`, `branding` e `crm` — medido
-- nesta instalação, uma organização tem quatro dessas chaves e outra tem cinco.
-- Sobrescrever apagaria configuração de quem nem estava olhando para etiquetas.
-- O precedente está escrito em `fn_definir_cliente_pela_agenda` e no comentário
-- da função de branding.
--
-- ─── E NUNCA `.from('organizations').update(...)` PELA SESSÃO ───────────────
--
-- A única policy de escrita de `organizations` é de platform admin. O UPDATE de
-- um admin de tenant casa ZERO linhas e devolve SUCESSO — a tela diria "salvo"
-- sobre coisa nenhuma. Por isso as escritas são `security definer` e conferem
-- papel, suporte e MFA por dentro, pelo `auth.uid()`.
--
-- A LEITURA (`fn_tags_inventario`) é `security invoker`, e isso é o oposto de
-- um descuido: ela recebe a organização por argumento e é concedida a
-- `authenticated`, então `definer` a tornaria leitura cross-tenant — a classe
-- de defeito que a v1.0.0 sofreu em `emit_event` e `retrieve_top_k_chunks`. Sob
-- invoker quem isola é a RLS de `conversations`, `contacts` e `organizations`,
-- e `p_org` volta a ser o que devia: um filtro, não uma fronteira.

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · o inventário — o que existe, e quanta gente usa
-- ════════════════════════════════════════════════════════════════════════════
--
-- Uma função e não cinco consultas: a tela precisa dos seis conjuntos (canônicas,
-- arquivadas e em-uso, vezes dois escopos) no MESMO instante, ou mostraria
-- contagem de um momento e vocabulário de outro. E o PostgREST não expressa
-- `distinct unnest` com contagem.
--
-- `fn_tags_de_conversa_em_uso` continua existindo e não muda: o seletor do Inbox
-- é dela, e esta função não é o mesmo contrato (aquela devolve só nomes, para um
-- seletor; esta devolve contagem, para uma tela de curadoria).
--
-- O TETO de 200 por escopo é o mesmo da função irmã, e pelo mesmo motivo: numa
-- organização bagunçada a lista cresceria sem limite e isto vai para uma tela.
create or replace function public.fn_tags_inventario(p_org uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  -- ⚠️ AGRUPA POR `lower(btrim(...))`, E ISSO É INTEGRIDADE, NÃO ESTÉTICA.
  --
  -- Toda operação desta migration normaliza o nome antes de agir. Se o
  -- inventário agrupasse pelo texto CRU, a tela mostraria `VIP — 300 contatos`,
  -- o operador confirmaria "apagar VIP, que está em 300 contatos", e o que
  -- chegaria ao banco seria `vip` — outro conjunto, possivelmente vazio.
  -- Operação destrutiva executada num alvo DIFERENTE do confirmado, com toast de
  -- sucesso e os 300 intactos no próximo refresh.
  --
  -- Não é hipótese de laboratório: `lib/automation/actions/add-tag.ts` grava
  -- `config.tags.map(String)` direto em `contacts.tags` pelo ADMIN CLIENT, sem
  -- trim e sem lowercase. Uma regra de automação escrita com `VIP` produz
  -- exatamente esse dado. (Normalizar na origem é conserto próprio, fora desta
  -- migration; aqui a curadoria passa a enxergar o que existe de verdade.)
  --
  -- `count(distinct c.id)` e não `count(*)`: um registro que tenha `VIP` e `vip`
  -- é UM registro, e é o número de registros que o operador vai perder.
  with conversa as (
    select lower(btrim(t.tag)) as tag, count(distinct c.id)::bigint as n
      from public.conversations c, unnest(c.tags) as t(tag)
     where c.organization_id = p_org and c.tags is not null
       and btrim(t.tag) <> ''
     group by 1 order by 2 desc, 1 limit 200
  ), contato as (
    select lower(btrim(t.tag)) as tag, count(distinct c.id)::bigint as n
      from public.contacts c, unnest(c.tags) as t(tag)
     where c.organization_id = p_org and c.tags is not null
       and btrim(t.tag) <> ''
       -- Contato anonimizado (LGPD) e contato fundido não contam: o primeiro
       -- não existe mais como pessoa e o segundo virou outro. Contá-los faria o
       -- operador ver um número que nenhuma tela de contatos reproduz, e apagar
       -- uma etiqueta "de 30" que na verdade estava em 12.
       and c.is_anonymized = false and c.is_merged_into is null
     group by 1 order by 2 desc, 1 limit 200
  ), org as (
    select o.settings as s from public.organizations o where o.id = p_org
  )
  select jsonb_build_object(
    'conversa', jsonb_build_object(
      'canonicas',  coalesce((select s -> 'canonical_conversation_tags' from org), '[]'::jsonb),
      'arquivadas', coalesce((select s -> 'archived_conversation_tags'  from org), '[]'::jsonb),
      'em_uso',     coalesce((select jsonb_agg(jsonb_build_object('tag', tag, 'n', n)) from conversa), '[]'::jsonb)),
    'contato', jsonb_build_object(
      'canonicas',  coalesce((select s -> 'canonical_contact_tags' from org), '[]'::jsonb),
      'arquivadas', coalesce((select s -> 'archived_contact_tags'  from org), '[]'::jsonb),
      'em_uso',     coalesce((select jsonb_agg(jsonb_build_object('tag', tag, 'n', n)) from contato), '[]'::jsonb)),
    -- A tela precisa saber se `cliente` está reservada ANTES de oferecer os
    -- botões, para não desenhar uma ação que o servidor vai recusar.
    'cliente_pela_agenda', coalesce((select s -> 'crm' -> 'cliente_pela_agenda' from org), 'false'::jsonb) = 'true'::jsonb
  );
$$;

comment on function public.fn_tags_inventario(uuid) is
  'Inventário de etiquetas da organização (migration 9005): canônicas, arquivadas e em-uso-com-contagem, '
  'para os DOIS vocabulários (conversa e contato), além do aviso de que a etiqueta cliente está reservada. '
  'security invoker de propósito: recebe a organização por argumento e é concedida a authenticated, '
  'então definer seria leitura cross-tenant. Quem isola é a RLS.';

revoke execute on function public.fn_tags_inventario(uuid) from public, anon;
grant  execute on function public.fn_tags_inventario(uuid) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · a guarda, escrita uma vez
-- ════════════════════════════════════════════════════════════════════════════
--
-- As cinco escritas conferem a MESMA coisa, e repetir o bloco cinco vezes é
-- como uma delas acaba conferindo de menos numa revisão futura — a sexta cópia
-- é sempre a que esquece o MFA. Aqui ela existe uma vez e cada função diz
-- apenas qual é o seu piso de papel.
create or replace function public.fn_tags_guarda(p_org uuid, p_min text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or p_org is null
     or not public.fn_role_at_least(p_org, p_min)
     or not public.fn_support_write_allowed(p_org) then
    raise exception 'tags_forbidden' using errcode = '42501';
  end if;
  if not public.fn_session_mfa_proven() then
    raise exception 'tags_mfa_required' using errcode = '42501';
  end if;
end $$;

comment on function public.fn_tags_guarda(uuid, text) is
  'Guarda comum das escritas de curadoria de etiquetas (migration 9005): papel mínimo, sessão de suporte '
  'em leitura e MFA provado nesta sessão. Levanta 42501; nunca devolve false — recusa que volta como valor '
  'é recusa que o chamador esquece de olhar.';

revoke execute on function public.fn_tags_guarda(uuid, text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- As chaves de `settings` de cada escopo, derivadas e não digitadas.
--
-- Com as quatro strings escritas à mão em cinco funções, bastava um `_` no
-- lugar errado para uma operação gravar numa chave que ninguém lê — e o sintoma
-- seria "salvei e não aconteceu nada", sem erro nenhum.
create or replace function public.fn_tags_chave(p_escopo text, p_arquivadas boolean)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_escopo = 'conversa' and not p_arquivadas then 'canonical_conversation_tags'
    when p_escopo = 'conversa' and     p_arquivadas then 'archived_conversation_tags'
    when p_escopo = 'contato'  and not p_arquivadas then 'canonical_contact_tags'
    when p_escopo = 'contato'  and     p_arquivadas then 'archived_contact_tags'
  end;
$$;

revoke execute on function public.fn_tags_chave(text, boolean) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · criar e arquivar — as duas de `manager`, que não tocam registro nenhum
-- ════════════════════════════════════════════════════════════════════════════
--
-- `p_tag` chega normalizada do servidor (trim + lowercase + 40), a MESMA régua
-- de `conversationTagSchema`. Normaliza de novo aqui porque esta função é RPC
-- alcançável por qualquer pessoa logada — o schema Zod da rota é conveniência do
-- cliente, não fronteira. Duas réguas diferentes produziriam uma canônica
-- `Urgente` que o Inbox (que faz lowercase) nunca casaria.
create or replace function public.fn_tags_criar(p_org uuid, p_escopo text, p_tag text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chave text := public.fn_tags_chave(p_escopo, false);
  v_arq   text := public.fn_tags_chave(p_escopo, true);
  v_tag   text := lower(btrim(coalesce(p_tag, '')));
  v_canon text[];
  v_arqui text[];
begin
  perform public.fn_tags_guarda(p_org, 'manager');
  if v_chave is null then raise exception 'tags_escopo_invalido' using errcode = '22023'; end if;
  if v_tag = '' or length(v_tag) > 40 then
    raise exception 'tags_nome_invalido' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 9005));

  select coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_chave, '[]'::jsonb))), '{}'),
         coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_arq,   '[]'::jsonb))), '{}')
    into v_canon, v_arqui
    from public.organizations where id = p_org;
  if not found then raise exception 'organization_not_found' using errcode = 'P0002'; end if;

  if v_tag = any(v_canon) then
    return jsonb_build_object('mudou', false, 'motivo', 'ja_existe');
  end if;
  -- O TETO É 50, o mesmo de `canonicalConversationTagsSchema`. Se divergisse, a
  -- função gravaria a 51ª e o Zod da leitura devolveria `[]` no `.catch` — o
  -- vocabulário inteiro sumiria da tela por causa de uma palavra a mais.
  if array_length(v_canon, 1) >= 50 then
    raise exception 'tags_limite' using errcode = '23514';
  end if;

  -- Criar uma etiqueta ARQUIVADA é desarquivá-la, não duplicá-la. Quem digita
  -- de novo o nome que arquivou mês passado quer a mesma palavra de volta, com
  -- o histórico dela — não uma segunda entrada homônima em duas listas.
  update public.organizations
     set settings = jsonb_set(
           jsonb_set(coalesce(settings, '{}'::jsonb), array[v_chave],
                     to_jsonb(v_canon || v_tag), true),
           array[v_arq], to_jsonb(array_remove(v_arqui, v_tag)), true)
   where id = p_org;

  return jsonb_build_object('mudou', true, 'motivo',
    case when v_tag = any(v_arqui) then 'desarquivada' else 'criada' end);
end $$;

comment on function public.fn_tags_criar(uuid, text, text) is
  'Acrescenta uma etiqueta ao vocabulário canônico do escopo (migration 9005). manager+. Não toca conversa '
  'nem contato. Nome que estava arquivado volta desarquivado, em vez de virar entrada duplicada.';

revoke execute on function public.fn_tags_criar(uuid, text, text) from public, anon;
grant  execute on function public.fn_tags_criar(uuid, text, text) to authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- Arquivar é o meio-termo que faltava entre "continuo sugerindo" e "destruí".
create or replace function public.fn_tags_arquivar(p_org uuid, p_escopo text, p_tag text, p_arquivar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chave text := public.fn_tags_chave(p_escopo, false);
  v_arq   text := public.fn_tags_chave(p_escopo, true);
  v_tag   text := lower(btrim(coalesce(p_tag, '')));
  v_canon text[];
  v_arqui text[];
begin
  perform public.fn_tags_guarda(p_org, 'manager');
  if v_chave is null or p_arquivar is null then
    raise exception 'tags_escopo_invalido' using errcode = '22023';
  end if;
  if v_tag = '' then raise exception 'tags_nome_invalido' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 9005));

  select coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_chave, '[]'::jsonb))), '{}'),
         coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_arq,   '[]'::jsonb))), '{}')
    into v_canon, v_arqui
    from public.organizations where id = p_org;
  if not found then raise exception 'organization_not_found' using errcode = 'P0002'; end if;

  if p_arquivar then
    v_arqui := (select coalesce(array_agg(distinct x order by x), '{}') from unnest(v_arqui || v_tag) x);
    v_canon := array_remove(v_canon, v_tag);
  else
    v_canon := (select coalesce(array_agg(distinct x order by x), '{}') from unnest(v_canon || v_tag) x);
    v_arqui := array_remove(v_arqui, v_tag);
  end if;

  update public.organizations
     set settings = jsonb_set(
           jsonb_set(coalesce(settings, '{}'::jsonb), array[v_chave], to_jsonb(v_canon), true),
           array[v_arq], to_jsonb(v_arqui), true)
   where id = p_org;

  return jsonb_build_object('mudou', true, 'arquivada', p_arquivar);
end $$;

comment on function public.fn_tags_arquivar(uuid, text, text, boolean) is
  'Tira a etiqueta das sugestões sem apagar o histórico de quem já a tem, ou a devolve (migration 9005). '
  'manager+. Não escreve em conversa nem em contato — quem tem a etiqueta continua tendo, e o filtro '
  'continua encontrando.';

revoke execute on function public.fn_tags_arquivar(uuid, text, text, boolean) from public, anon;
grant  execute on function public.fn_tags_arquivar(uuid, text, text, boolean) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 4 · as três de `admin` — as que reescrevem `tags` e não têm desfazer
-- ════════════════════════════════════════════════════════════════════════════
--
-- A RESERVA, aplicada uma vez para as três. Ver o bloco longo no topo: quando
-- `settings.crm.cliente_pela_agenda` está ligada, mexer na etiqueta `cliente` de
-- um contato transfere à equipe a posse que era do sistema, em todo contato
-- tocado, sem erro e sem evento — e nenhuma das duas funções da migration 0262
-- aprende o nome novo, porque `'cliente'` é literal constante nas duas.
create or replace function public.fn_tags_reserva(p_org uuid, p_escopo text, p_tags text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_escopo <> 'contato' or not ('cliente' = any(coalesce(p_tags, '{}'::text[]))) then
    return;
  end if;

  -- ⛔ A TRAVA COMPARTILHADA DE SEMENTE 262, E ELA NÃO É A MESMA DE 9005.
  --
  -- Ler o interruptor sem travar abre uma janela que termina em dano silencioso
  -- e permanente. A corrida, com dois administradores da mesma organização e
  -- nenhuma má-fé:
  --
  --   1. A chama `apagarTag('contato','cliente')`. A regra está DESLIGADA, e
  --      esta função deixa passar.
  --   2. B chama `definirClientePelaAgenda(true)`. Toma a EXCLUSIVA de 262
  --      (0262:611), grava a chave, etiqueta a base inteira gravando
  --      `client_tag_by_system`, e commita.
  --   3. O UPDATE de A destrava, relê sob READ COMMITTED e tira `cliente` de
  --      todo contato. Em cada linha, `fn_colunas_de_cliente_sao_do_sistema`
  --      (0262:412) vê a presença de `cliente` mudar sem o sistema ter gravado o
  --      dono na mesma escrita, e zera `client_tag_by_system`.
  --
  -- Resultado: a posse passa à equipe em TODOS os contatos, sem erro, sem evento
  -- e sem como saber depois quem era do sistema. A partir dali o sistema nunca
  -- mais tira `cliente` de ninguém — exatamente o desfecho que o cabeçalho desta
  -- migration existe para impedir.
  --
  -- A trava de 9005, que as chamadoras tomam depois, NÃO serve aqui: é outra
  -- chave, e duas chaves diferentes não se esperam. A semente tem de ser a 262,
  -- a mesma que a 0262 usa, e COMPARTILHADA porque esta função só lê. É o
  -- idioma que o repo já usa em 0262:480 e 0262:753.
  --
  -- Ordem de travas, conferida para não trocar uma corrida por um deadlock:
  -- a curadoria toma `262-shared → 9005 → linhas`; `fn_definir_cliente_pela_agenda`
  -- toma `262-exclusive → linhas`. Não há ciclo.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_org::text, 262));

  if exists (select 1 from public.organizations
              where id = p_org and (settings -> 'crm' -> 'cliente_pela_agenda') = 'true'::jsonb) then
    raise exception 'tags_etiqueta_do_sistema' using errcode = '42501';
  end if;
end $$;

-- ⚖️ E A RESERVA TEM O TAMANHO CERTO, o que foi MEDIDO e não suposto.
--
-- Ela barra só o que mexe na PRESENÇA de `cliente`, que é o que o trigger
-- observa. Curadoria LATERAL não é barrada e não precisa ser: medido contra o
-- trigger real da 0262, num contato `{cliente,vip}` com `client_tag_by_system =
-- 'added'`, mesclar `vip` em `premium` deixou as tags em `{cliente,premium}` e a
-- posse em `added`. O segundo bloco do trigger compara a presença de `cliente`
-- em old e new, e ela não mudou.
--
-- Isso importa porque a tentação era barrar qualquer operação que tocasse um
-- contato etiquetado como cliente — o que travaria a curadoria inteira na
-- organização que mais precisa dela, em nome de um risco que não existe.
comment on function public.fn_tags_reserva(uuid, text, text[]) is
  'Recusa curadoria destrutiva sobre a etiqueta cliente de CONTATO enquanto a regra cliente_pela_agenda '
  'estiver ligada (migrations 0262 + 9005). Desligada, cliente é palavra comum e a curadoria a trata como '
  'qualquer outra — porque aí ela é mesmo da equipe.';

revoke execute on function public.fn_tags_reserva(uuid, text, text[]) from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- RENOMEAR — e a pergunta que o pedido mandou não deixar implícita:
-- o que acontece com quem já usa o nome antigo?
--
-- Ele é REESCRITO. "Renomear" para quem opera significa "esta etiqueta passou a
-- se chamar assim", e a leitura alternativa (trocar só a sugestão e deixar os
-- registros com a palavra velha) recriaria em uma operação exatamente o defeito
-- que esta tela veio consertar: vocabulário dizendo uma coisa, banco dizendo
-- outra, filtro devolvendo zero.
--
-- DESTINO QUE JÁ EXISTE NO VOCABULÁRIO É RECUSA, não fusão silenciosa. Renomear
-- `urgente` para `prioritário` quando `prioritário` já existe é uma MESCLA, e
-- mesclar tem contador, confirmação e caminho próprio. Fazê-la por baixo do
-- botão de renomear entregaria duas etiquetas fundidas a quem pediu uma
-- renomeada — e sem aviso, porque ninguém desconfia de "renomear".
--
-- A ORDEM ALFABÉTICA no array reescrito é deliberada: `tags` não tem semântica
-- de posição (o editor do Inbox faz append puro) e ordenar dá resultado
-- determinístico, que é o que torna o invariante verificável.
create or replace function public.fn_tags_renomear(p_org uuid, p_escopo text, p_de text, p_para text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chave text := public.fn_tags_chave(p_escopo, false);
  v_arq   text := public.fn_tags_chave(p_escopo, true);
  v_de    text := lower(btrim(coalesce(p_de, '')));
  v_para  text := lower(btrim(coalesce(p_para, '')));
  v_canon text[];
  v_arqui text[];
  v_n     integer := 0;
begin
  perform public.fn_tags_guarda(p_org, 'admin');
  if v_chave is null then raise exception 'tags_escopo_invalido' using errcode = '22023'; end if;
  if v_de = '' or v_para = '' or length(v_para) > 40 then
    raise exception 'tags_nome_invalido' using errcode = '22023';
  end if;
  if v_de = v_para then return jsonb_build_object('mudou', false, 'registros', 0); end if;
  perform public.fn_tags_reserva(p_org, p_escopo, array[v_de, v_para]);

  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 9005));

  select coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_chave, '[]'::jsonb))), '{}'),
         coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_arq,   '[]'::jsonb))), '{}')
    into v_canon, v_arqui
    from public.organizations where id = p_org;
  if not found then raise exception 'organization_not_found' using errcode = 'P0002'; end if;

  if v_para = any(v_canon) or v_para = any(v_arqui) then
    raise exception 'tags_destino_ja_existe' using errcode = '23505';
  end if;

  -- ⚠️ CASA POR `lower(btrim(x))`, E NÃO POR IGUALDADE CRUA — pelo mesmo motivo
  -- que o inventário agrupa normalizado. Um `tags @> array[v_de]` erraria toda
  -- variante que a automação gravou com maiúscula, e a tela reportaria sucesso
  -- sobre a etiqueta que continua lá.
  --
  -- O custo é o índice GIN `idx_*_tags_gin`, que este predicado não usa. Aceito
  -- de propósito: são três operações administrativas raras, o `WHERE` continua
  -- amarrado a `organization_id` (que tem índice), e o preço de um scan dentro
  -- de UMA organização é menor que o de destruir o alvo errado em silêncio.
  if p_escopo = 'conversa' then
    update public.conversations
       set tags = (select coalesce(array_agg(distinct y order by y), '{}')
                     from (select case when lower(btrim(x)) = v_de then v_para else x end as y
                             from unnest(tags) x) t)
     where organization_id = p_org
       and exists (select 1 from unnest(tags) x where lower(btrim(x)) = v_de);
    get diagnostics v_n = row_count;
  else
    update public.contacts
       set tags = (select coalesce(array_agg(distinct y order by y), '{}')
                     from (select case when lower(btrim(x)) = v_de then v_para else x end as y
                             from unnest(tags) x) t)
     where organization_id = p_org
       and exists (select 1 from unnest(tags) x where lower(btrim(x)) = v_de)
       and is_anonymized = false and is_merged_into is null;
    get diagnostics v_n = row_count;
  end if;

  update public.organizations
     set settings = jsonb_set(
           jsonb_set(coalesce(settings, '{}'::jsonb), array[v_chave],
                     to_jsonb((select coalesce(array_agg(distinct x order by x), '{}')
                                 from unnest(array_replace(v_canon, v_de, v_para)) x)), true),
           array[v_arq],
           to_jsonb((select coalesce(array_agg(distinct x order by x), '{}')
                       from unnest(array_replace(v_arqui, v_de, v_para)) x)), true)
   where id = p_org;

  return jsonb_build_object('mudou', true, 'registros', v_n);
end $$;

comment on function public.fn_tags_renomear(uuid, text, text, text) is
  'Renomeia a etiqueta no vocabulário E em todo registro que a usa (migration 9005). admin+. Destino que já '
  'existe no vocabulário é recusado com 23505 tags_destino_ja_existe — isso seria uma MESCLA, e mesclar tem '
  'contador e confirmação próprios.';

revoke execute on function public.fn_tags_renomear(uuid, text, text, text) from public, anon;
grant  execute on function public.fn_tags_renomear(uuid, text, text, text) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- MESCLAR — a operação sem a qual o vocabulário degrada sozinho.
--
-- O campo livre do Inbox é a porta de entrada da curadoria, e continua aberto de
-- propósito: fechá-lo obrigaria o atendente a parar o atendimento para cadastrar
-- palavra. O preço dessa porta é `urgente`, `Urgente` e `URGENTE` convivendo —
-- e as três já chegam normalizadas em lowercase, então o caso real é pior e mais
-- humano: `urgente`, `urgent`, `urgentr`, `muito-urgente`.
--
-- Sem mesclar, a única saída seria apagar as variantes, o que joga fora o
-- histórico de quem as usou. Mesclar preserva: cada registro que tinha qualquer
-- origem passa a ter o destino, e quem já tinha os dois não fica com duplicata.
create or replace function public.fn_tags_mesclar(p_org uuid, p_escopo text, p_origens text[], p_destino text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_chave   text := public.fn_tags_chave(p_escopo, false);
  v_arq     text := public.fn_tags_chave(p_escopo, true);
  v_destino text := lower(btrim(coalesce(p_destino, '')));
  v_origens text[];
  v_canon   text[];
  v_arqui   text[];
  v_n       integer := 0;
begin
  perform public.fn_tags_guarda(p_org, 'admin');
  if v_chave is null then raise exception 'tags_escopo_invalido' using errcode = '22023'; end if;
  if v_destino = '' or length(v_destino) > 40 then
    raise exception 'tags_nome_invalido' using errcode = '22023';
  end if;

  -- As origens, normalizadas, sem o destino e sem repetição. Tirar o destino da
  -- lista importa: com ele dentro, o UPDATE abaixo removeria a palavra e a
  -- devolveria na mesma escrita — inofensivo no resultado, mas faria o contador
  -- incluir registros que já estavam certos, e o contador é o que o operador lê
  -- para decidir.
  select coalesce(array_agg(distinct lower(btrim(t)) order by lower(btrim(t))), '{}')
    into v_origens
    from unnest(coalesce(p_origens, '{}'::text[])) t
   where lower(btrim(t)) <> '' and lower(btrim(t)) <> v_destino;

  if array_length(v_origens, 1) is null then
    return jsonb_build_object('mudou', false, 'registros', 0);
  end if;
  -- Um teto que não é burocracia: sem ele, um p_origens de dez mil entradas
  -- viraria uma interseção com dez mil elementos e a tela seguraria a conexão.
  if array_length(v_origens, 1) > 50 then
    raise exception 'tags_limite' using errcode = '23514';
  end if;
  perform public.fn_tags_reserva(p_org, p_escopo, v_origens || v_destino);

  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 9005));

  select coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_chave, '[]'::jsonb))), '{}'),
         coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_arq,   '[]'::jsonb))), '{}')
    into v_canon, v_arqui
    from public.organizations where id = p_org;
  if not found then raise exception 'organization_not_found' using errcode = 'P0002'; end if;

  -- Normalizado dos dois lados, como em renomear e apagar: `VIP` e `vip` são a
  -- mesma origem, e quem marcou `VIP` na tela espera que `VIP` seja mesclado.
  if p_escopo = 'conversa' then
    update public.conversations
       set tags = (select coalesce(array_agg(distinct x order by x), '{}')
                     from unnest(tags || v_destino) x
                    where not (lower(btrim(x)) = any(v_origens)))
     where organization_id = p_org
       and exists (select 1 from unnest(tags) x where lower(btrim(x)) = any(v_origens));
    get diagnostics v_n = row_count;
  else
    update public.contacts
       set tags = (select coalesce(array_agg(distinct x order by x), '{}')
                     from unnest(tags || v_destino) x
                    where not (lower(btrim(x)) = any(v_origens)))
     where organization_id = p_org
       and exists (select 1 from unnest(tags) x where lower(btrim(x)) = any(v_origens))
       and is_anonymized = false and is_merged_into is null;
    get diagnostics v_n = row_count;
  end if;

  -- O destino passa a ser canônico mesmo que tenha nascido do campo livre: é
  -- disso que a curadoria trata, promover o que a operação já usa. E as origens
  -- somem das DUAS listas, canônica e arquivada: uma origem que sobrasse na
  -- arquivada voltaria a ser sugerida no dia em que alguém a desarquivasse, para
  -- uma palavra que não está mais em registro nenhum.
  update public.organizations
     set settings = jsonb_set(
           jsonb_set(coalesce(settings, '{}'::jsonb), array[v_chave],
                     to_jsonb((select coalesce(array_agg(distinct x order by x), '{}')
                                 from unnest(v_canon || v_destino) x
                                where not (x = any(v_origens)))), true),
           array[v_arq],
           to_jsonb((select coalesce(array_agg(distinct x order by x), '{}')
                       from unnest(v_arqui) x where not (x = any(v_origens)))), true)
   where id = p_org;

  return jsonb_build_object('mudou', true, 'registros', v_n, 'origens', to_jsonb(v_origens));
end $fn$;

comment on function public.fn_tags_mesclar(uuid, text, text[], text) is
  'Funde variantes numa etiqueta só, no vocabulário e nos registros (migration 9005). admin+. Quem já tinha origem e destino não fica com duplicata; o destino vira canônico mesmo tendo nascido do campo livre do Inbox, que é o caminho normal da curadoria.';

revoke execute on function public.fn_tags_mesclar(uuid, text, text[], text) from public, anon;
grant  execute on function public.fn_tags_mesclar(uuid, text, text[], text) to authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- APAGAR — e o contador existe para o operador ver o estrago ANTES.
--
-- Esta é a única das cinco que destrói dado. O inventário já entrega a contagem
-- por etiqueta, então a tela consegue perguntar "apagar `troca`, que está em 312
-- conversas?" — e é a diferença entre uma decisão e um susto. A função devolve o
-- número de novo, medido no instante da escrita, porque entre o inventário e o
-- clique a contagem pode ter mudado.
create or replace function public.fn_tags_apagar(p_org uuid, p_escopo text, p_tag text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_chave text := public.fn_tags_chave(p_escopo, false);
  v_arq   text := public.fn_tags_chave(p_escopo, true);
  v_tag   text := lower(btrim(coalesce(p_tag, '')));
  v_canon text[];
  v_arqui text[];
  v_n     integer := 0;
begin
  perform public.fn_tags_guarda(p_org, 'admin');
  if v_chave is null then raise exception 'tags_escopo_invalido' using errcode = '22023'; end if;
  if v_tag = '' then raise exception 'tags_nome_invalido' using errcode = '22023'; end if;
  perform public.fn_tags_reserva(p_org, p_escopo, array[v_tag]);

  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 9005));

  select coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_chave, '[]'::jsonb))), '{}'),
         coalesce(array(select jsonb_array_elements_text(coalesce(settings -> v_arq,   '[]'::jsonb))), '{}')
    into v_canon, v_arqui
    from public.organizations where id = p_org;
  if not found then raise exception 'organization_not_found' using errcode = 'P0002'; end if;

  -- Normalizado: apagar `vip` tira `vip`, `VIP` e ` Vip `. O contador que a tela
  -- mostrou no aviso foi calculado com a mesma régua, então o número confirmado
  -- e o número destruído são o mesmo número.
  if p_escopo = 'conversa' then
    update public.conversations
       set tags = (select coalesce(array_agg(distinct x order by x), '{}')
                     from unnest(tags) x where lower(btrim(x)) <> v_tag)
     where organization_id = p_org
       and exists (select 1 from unnest(tags) x where lower(btrim(x)) = v_tag);
    get diagnostics v_n = row_count;
  else
    update public.contacts
       set tags = (select coalesce(array_agg(distinct x order by x), '{}')
                     from unnest(tags) x where lower(btrim(x)) <> v_tag)
     where organization_id = p_org
       and exists (select 1 from unnest(tags) x where lower(btrim(x)) = v_tag)
       and is_anonymized = false and is_merged_into is null;
    get diagnostics v_n = row_count;
  end if;

  update public.organizations
     set settings = jsonb_set(
           jsonb_set(coalesce(settings, '{}'::jsonb), array[v_chave],
                     to_jsonb(array_remove(v_canon, v_tag)), true),
           array[v_arq], to_jsonb(array_remove(v_arqui, v_tag)), true)
   where id = p_org;

  return jsonb_build_object('mudou', true, 'registros', v_n);
end $fn$;

comment on function public.fn_tags_apagar(uuid, text, text) is
  'Apaga a etiqueta do vocabulário E de todo registro que a usa (migration 9005). admin+, sem desfazer. Devolve quantos registros perderam a etiqueta, medido no instante da escrita: o inventário dá a previsão, esta função dá o fato.';

revoke execute on function public.fn_tags_apagar(uuid, text, text) from public, anon;
grant  execute on function public.fn_tags_apagar(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
