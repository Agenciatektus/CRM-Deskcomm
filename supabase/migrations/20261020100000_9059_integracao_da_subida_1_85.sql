-- manifest: 9059 — Tektus: a subida do upstream 1.85 sem um lado apagar o outro. Roda por último (depois da 0688) e deixa a versão INTEGRADA de fn_vocabulario_de_tags_operar: a da 9038/9058 (guarda de suporte e MFA, trava da curadoria e da linha, reserva de `cliente`, excluir que só anula a entrada excluída) com o que a 0677 (#2801) acrescentou — o desempate pelo metadado antes da ordem (renomear que junta não perde a cor) e o aviso `juntou` na resposta. E fn_definir_marca_da_organizacao (0406) passa a recusar `accent_dark_hex` fora de `^#[0-9a-f]{6}$` (22023), a mesma régua de `accent_hex` e do CHECK de platform_branding (0627): na organização a cor do escuro mora no jsonb e só a action a validava (P2 do parecer da #215). Idempotente.
--
-- 9059: integração da subida do upstream 1.85 (etapa 4 de 4).
--
-- ## O defeito de ordem (o mesmo da 9055/9056/9058)
--
--   objeto                              upstream          fork
--   fn_vocabulario_de_tags_operar       0677 (#2801)      9038 / 9058
--
-- A 0677 (20261018120002) roda ANTES da 9058 (20261020000000), que redefine a
-- função inteira com a versão da 9038. Na cadeia, a 0677 era apagada sem aviso:
-- renomear "a" (com cor) para "b" (sem cor) voltava a perder a cor, e a tela
-- não recebia o `juntou`. Aqui a função é a da 9058, letra a letra, com as três
-- mudanças da 0677 (declaração de `v_juntou`, bloco (e0), `order by` com o
-- metadado e a chave `juntou` no retorno). Nada da guarda sai.
--
-- Nenhum outro objeto que o fork endureceu é redefinido pelas 19 migrations
-- novas (0618, 0643, 0663, 0665, 0667, 0668, 0674..0683, 0685, 0686, 0688):
-- conferido por nome de função, policy, constraint, view e trigger contra as
-- 9001..9058. As policies novas da 0680 (`crm_tasks_write`,
-- `calendar_appointments_write`) já trazem o papel no USING.
--
-- E o P2 do parecer da #215: a cor do tema escuro (#2482) entrou nos dois
-- caminhos, mas só o da instalação tinha rede no banco (CHECK da 0627). O da
-- organização grava no jsonb pela `fn_definir_marca_da_organizacao`, que
-- conferia `accent_hex` e deixava `accent_dark_hex` passar cru. Agora a mesma
-- regex, o mesmo 22023. Corpo da 0406 letra a letra, mais a conferência.
--
-- Mesmo corpo no bloco "SUBIDA 1.85 (migration 9059)" do baseline.sql, antes
-- da VARREDURA anon (cria função).

-- ---- 1. fn_vocabulario_de_tags_operar: 9038/9058 + 0677 ----
create or replace function public.fn_vocabulario_de_tags_operar(
  p_org uuid,
  p_acao text,
  p_tag text,
  p_destino text,
  p_cor text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tag     text := btrim(coalesce(p_tag, ''));
  v_destino text := btrim(coalesce(p_destino, ''));
  -- A cor entra normalizada (minúscula, sem espaço). A rota valida com Zod antes;
  -- esta linha defende o caminho que NÃO passa por ela — RPC direta, psql, um
  -- cliente futuro. Sem isso, `#FFF` gravaria e a comparação por igualdade da
  -- tela (que compara o que o servidor devolveu) passaria a mentir.
  v_cor     text := lower(btrim(coalesce(p_cor, '')));
  v_remover boolean;
  v_so_cor  boolean;
  v_contatos integer := 0;
  v_leads integer := 0;
  v_conversas integer := 0;
  v_regras integer := 0;
  v_id uuid;
  v_ids uuid[];
  v_settings jsonb;
  v_antes jsonb;
  v_depois jsonb;
  v_definido boolean := false;
  -- 9038: as quatro listas de sugestão (0244/9005) e os dois escopos.
  v_chave text;
  v_escopo text;
  v_sugeridas jsonb;
  v_arquivadas jsonb;
  -- (e0) 'duas entradas do vocabulário viraram uma' — issue #2801 (0677).
  v_juntou boolean := false;
begin
  -- Portão de papel ANTES de qualquer escrita. Definer com p_org vindo da rota:
  -- é esta linha que separa o tenant de quem chama.
  if p_org is null or not public.fn_role_at_least(p_org, 'manager') then
    raise exception using errcode = '42501', message = 'insufficient_role';
  end if;
  -- 9038 (7): a MESMA guarda das escritas da 9005 — sessão de suporte em modo
  -- leitura e MFA provado nesta sessão (e `auth.uid()` presente). O papel acima
  -- continua respondendo `insufficient_role`, como sempre; a guarda acrescenta
  -- o que só a rota conferia, e a RPC é alcançável direto pelo PostgREST.
  perform public.fn_tags_guarda(p_org, 'manager');

  if p_acao is null or p_acao not in ('renomear', 'juntar', 'excluir', 'definir_cor') then
    raise exception using errcode = '22023', message = 'acao_invalida';
  end if;
  if v_tag = '' then
    raise exception using errcode = '22023', message = 'tag_obrigatoria';
  end if;
  v_remover := (p_acao = 'excluir');
  v_so_cor  := (p_acao = 'definir_cor');
  if not v_remover and not v_so_cor and v_destino = '' then
    raise exception using errcode = '22023', message = 'destino_obrigatorio';
  end if;
  -- `v_cor` vazio é pedido legítimo ("sem cor"): limpa. O que não passa é cor
  -- malformada — gravar `#12` e devolver `#12` para a tela pintar deixaria o
  -- chip sem cor sem ninguém saber por quê.
  if v_so_cor and v_cor <> '' and v_cor !~ '^#[0-9a-f]{6}$' then
    raise exception using errcode = '22023', message = 'cor_invalida';
  end if;

  -- ── POR QUE NÃO SAI EVENTO DAQUI ──────────────────────────────────────────
  --
  -- Os laços abaixo CONTAM as linhas alteradas e não emitem nada em `event_log`.
  -- A primeira versão emitia `contact.tags_changed` / `lead.tags_changed` /
  -- `conversation.tags_changed` POR LINHA, e nenhum desses tipos tem consumidor:
  -- `lib/event-log/register-handlers.ts` registra 13 handlers e nenhum os
  -- declara; o motor de automação ouve `lead.tag_added`/`contact.tag_added`, que
  -- é outro tipo (e disparar automação num renomear em lote seria pior que não
  -- disparar). Evento sem consumidor é o anti-pattern 3 do CLAUDE.md, e aqui
  -- custava milhares de linhas dentro de UMA transação, num log que nada drena e
  -- nada expurga.
  --
  -- Quem registra a operação é o AUDIT LOG, na borda: `tag_vocabulary.changed`
  -- em `app/api/v1/tags/vocabulario/route.ts`, com os contadores que este corpo
  -- devolve. E a tela aberta se atualiza pelo Realtime das próprias tabelas.

  -- ── (z) A COR SAI ANTES DOS LAÇOS, E NÃO É OTIMIZAÇÃO ─────────────────────
  --
  -- Cor é atributo do VOCABULÁRIO, não das linhas: `contacts.tags`,
  -- `crm_leads.tags` e `conversations.tags` continuam `text[]` de nomes, porque
  -- automação, webhook (`lead.tag_added`) e MCP (`*.tags_changed`) falam em
  -- string há versões (contrato da fatia S4). Então a ação `definir_cor` não tem
  -- o que reescrever em contatos, leads nem conversas — e os laços abaixo, se
  -- rodassem, custariam uma varredura das três tabelas para devolver zero.
  --
  -- O bloco das listas de sugestão (mais abaixo) é pior que inútil aqui: ele
  -- troca o nome da semente por `v_destino` e descarta o que sobra vazio — com
  -- `destino` nulo nesta ação, a semente seria APAGADA. Daí o `return` cedo:
  -- nesta ação, só o vocabulário curado muda.
  if v_so_cor then
    -- 9038 (3): trava da curadoria e da linha — ver o cabeçalho da migration.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 9005));
    select coalesce(o.settings, '{}'::jsonb) into v_settings
    from public.organizations o where o.id = p_org
    for no key update;
    if v_settings is null then
      v_settings := '{}'::jsonb;
    end if;

    -- (a) tolera `settings.tags` torto (escalar/objeto): a leitura já tolera com
    -- `jsonb_typeof`, e sem esta guarda o `jsonb_array_elements` levantava
    -- `cannot extract elements from a scalar` e derrubava a tela inteira numa
    -- organização com o dado malformado. Lista que não é lista é lista vazia.
    v_antes := case
      when jsonb_typeof(v_settings -> 'tags') = 'array' then v_settings -> 'tags'
      else '[]'::jsonb
    end;
    v_depois := coalesce(
      (
        select jsonb_agg(entrada.valor order by entrada.ord)
        from (
          -- Uma entrada por chave canônica, agora acrescentando a cor na que
          -- casar. A entrada que era string vira objeto — a mesma forma que o
          -- rename já grava (mais abaixo, `jsonb_build_object('tag', …)`) — e
          -- `descricao` que já existia é PRESERVADA: esta ação fala de cor.
          --
          -- ⚠️ O desempate é o MESMO da função de leitura
          -- (`fn_vocabulario_de_tags`, `order by … (cor is not null or descricao
          -- is not null) desc`), e de propósito: onde a lista curada já tiver a
          -- mesma etiqueta duas vezes (uma como string, outra como objeto com
          -- cor), quem sobrevive é a entrada que carrega o metadado. Ordenar só
          -- por `ord` apagaria a cor na primeira vez que a ação rodasse sobre um
          -- vocabulário nesse estado, e a tela mostraria "sem cor" logo depois de
          -- alguém ter escolhido uma.
          select distinct on (lower(x.chave)) x.valor, x.ord
          from (
            select btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}')) as chave,
                   case
                     when lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
                     then case
                            when nullif(v_cor, '') is null
                            then (case when jsonb_typeof(e.valor) = 'string'
                                       then jsonb_build_object('tag', e.valor #>> '{}')
                                       else e.valor end) - 'cor'
                            else jsonb_set(
                                   case when jsonb_typeof(e.valor) = 'string'
                                        then jsonb_build_object('tag', e.valor #>> '{}')
                                        else e.valor end,
                                   '{cor}', to_jsonb(v_cor))
                          end
                     else case when jsonb_typeof(e.valor) = 'string'
                               then jsonb_build_object('tag', e.valor #>> '{}')
                               else e.valor end
                   end as valor,
                   e.ord
            from jsonb_array_elements(v_antes) with ordinality as e(valor, ord)
            where btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}')) <> ''
          ) x
          where x.valor is not null
          order by lower(x.chave),
                   ((x.valor ->> 'cor') is not null or (x.valor ->> 'descricao') is not null) desc,
                   x.ord
        ) as entrada
      ),
      '[]'::jsonb
    );

    -- A etiqueta que ainda não tinha entrada no vocabulário curado — semente, ou
    -- nome que só existe em uso (`no_vocabulario = false` na leitura) — GANHA
    -- uma. É deliberado: dar cor é curar. Sem isto, a tela ofereceria cor para
    -- uma etiqueta que continuaria marcada como "em uso, fora do vocabulário", e
    -- a leitura devolveria a cor de uma linha que não está na lista curada.
    if nullif(v_cor, '') is not null and not exists (
      select 1 from jsonb_array_elements(v_depois) as e(valor)
      where lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
    ) then
      v_depois := v_depois || jsonb_build_array(jsonb_build_object('tag', v_tag, 'cor', v_cor));
    end if;

    if v_depois <> v_antes then
      v_settings := jsonb_set(v_settings, '{tags}', v_depois);
      update public.organizations o
         set settings = v_settings,
             updated_at = now()
       where o.id = p_org;
      v_definido := true;
    end if;

    return jsonb_build_object(
      'acao', p_acao,
      'tag', v_tag,
      'destino', null,
      'cor', nullif(v_cor, ''),
      'contatos', 0,
      'leads', 0,
      'conversas', 0,
      'regras', 0,
      'alterou', v_definido
    );
  end if;

  -- 9038 (2): a etiqueta `cliente` de CONTATO, com a regra da agenda ligada, não
  -- é renomeada, juntada (como origem ou destino) nem excluída por aqui. A
  -- reserva é a da 9005 e compara em minúsculas, a régua de `fn_tags_normalizar`.
  --
  -- ⚠️ `array_remove(..., null)`: no excluir não há destino, e `'cliente' = any`
  -- de uma lista com nulo dá NULO, não falso. A reserva leria "talvez seja
  -- cliente" e recusaria a exclusão de QUALQUER etiqueta com a regra ligada.
  perform public.fn_tags_reserva(
    p_org, 'contato', array_remove(array[lower(v_tag), lower(nullif(v_destino, ''))], null)
  );

  -- 9038 (3): a ordem de travas é 262 compartilhada (reserva, só quando envolve
  -- `cliente`) → advisory 9005 (a mesma de criar/arquivar) → linha da
  -- organização → contatos, leads, conversas. `settings` é lido UMA vez, aqui,
  -- antes dos laços. `for no key update` e não `for update`: não bloqueia os
  -- INSERTs com FK para `organizations` (mensagens, event_log) enquanto a
  -- operação termina.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 9005));
  select coalesce(o.settings, '{}'::jsonb) into v_settings
  from public.organizations o where o.id = p_org
  for no key update;

  if v_settings is null then
    v_settings := '{}'::jsonb;
  end if;

  -- (a) contatos
  for v_id in
    with alvo as (
      select c.id, public.fn_tags_normalizar(c.tags, v_tag, v_destino, v_remover) as novas
      from public.contacts c
      where c.organization_id = p_org
        and exists (
          select 1 from unnest(coalesce(c.tags, '{}'::text[])) as x(valor)
          where lower(btrim(x.valor)) = lower(v_tag)
        )
    ), mudou as (
      update public.contacts c
         set tags = a.novas
        from alvo a
       where c.id = a.id
         and c.tags is distinct from a.novas
      returning c.id
    )
    select id from mudou
  loop
    v_contatos := v_contatos + 1;
  end loop;

  -- (b) leads
  for v_id in
    with alvo as (
      select l.id, public.fn_tags_normalizar(l.tags, v_tag, v_destino, v_remover) as novas
      from public.crm_leads l
      where l.organization_id = p_org
        and exists (
          select 1 from unnest(coalesce(l.tags, '{}'::text[])) as x(valor)
          where lower(btrim(x.valor)) = lower(v_tag)
        )
    ), mudou as (
      update public.crm_leads l
         set tags = a.novas
        from alvo a
       where l.id = a.id
         and l.tags is distinct from a.novas
      returning l.id
    )
    select id from mudou
  loop
    v_leads := v_leads + 1;
  end loop;

  -- (c) conversas
  for v_id in
    with alvo as (
      select v.id, public.fn_tags_normalizar(v.tags, v_tag, v_destino, v_remover) as novas
      from public.conversations v
      where v.organization_id = p_org
        and exists (
          select 1 from unnest(coalesce(v.tags, '{}'::text[])) as x(valor)
          where lower(btrim(x.valor)) = lower(v_tag)
        )
    ), mudou as (
      update public.conversations v
         set tags = a.novas
        from alvo a
       where v.id = a.id
         and v.tags is distinct from a.novas
      returning v.id
    )
    select id from mudou
  loop
    v_conversas := v_conversas + 1;
  end loop;

  -- (d) as regras dos agentes — o ponto da issue.
  --
  -- `excluir` NÃO apaga a regra: quem exclui a etiqueta é avisado de quantas
  -- regras a escrevem (o número volta no jsonb e a tela pede confirmação), mas
  -- apagar `add_tag` de um agente em produção é decisão de outra tela. Aqui a
  -- lista da regra só é reescrita quando o nome muda ou quando ele sai.
  --
  -- 9038 (3): `v_settings` já foi lido (e a linha travada) antes dos laços.

  if not v_remover then
    with alvo as (
      select r.id,
             jsonb_agg(
               case
                 when a.valor ->> 'type' = 'add_tag'
                  and jsonb_typeof(a.valor -> 'config' -> 'tags') = 'array'
                 then jsonb_set(
                        a.valor,
                        '{config,tags}',
                        to_jsonb(public.fn_tags_normalizar(
                          array(select jsonb_array_elements_text(a.valor -> 'config' -> 'tags')),
                          v_tag, v_destino, false
                        ))
                      )
                 else a.valor
               end
               order by a.ord
             ) as novas
      from public.automation_rules r
      cross join lateral jsonb_array_elements(coalesce(r.actions, '[]'::jsonb))
        with ordinality as a(valor, ord)
      where r.organization_id = p_org
      -- ⚠️ `group by r.id` E SÓ. Agrupar também pelo TIPO da ação devolvia uma
      -- linha por (regra, tipo), cada uma com `novas` = só o subconjunto daquele
      -- tipo; o `update ... from alvo` casava as duas linhas, o Postgres usava
      -- UMA arbitrária, e `is distinct from` é sempre verdadeiro num subconjunto
      -- — então a regra com ações de dois tipos era TRUNCADA a um tipo só, em
      -- toda organização, mesmo que ela nunca tenha citado a etiqueta renomeada.
      -- Medido num Postgres real: regra com `add_tag` + `assign_owner` ficava com
      -- uma ação, e a tela dizia "atualizada em 1 regra(s) de agente".
      group by r.id
    ), mudou as (
      update public.automation_rules r
         set actions = alvo.novas,
             updated_at = now()
        from alvo
       where r.id = alvo.id
         and r.actions is distinct from alvo.novas
      returning r.id
    )
    select count(*) into v_regras from mudou;
  else
    -- Exclusão: conta as regras que ainda escrevem a etiqueta, sem tocar nelas.
    select count(distinct r.id) into v_regras
    from public.automation_rules r
    cross join lateral jsonb_array_elements(coalesce(r.actions, '[]'::jsonb)) as a(valor)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(a.valor -> 'config' -> 'tags') = 'array'
           then a.valor -> 'config' -> 'tags' else '[]'::jsonb end
    ) as e(valor)
    where r.organization_id = p_org
      and a.valor ->> 'type' = 'add_tag'
      and lower(btrim(e.valor #>> '{}')) = lower(v_tag);
  end if;

  -- (e) o vocabulário da organização, nos lugares onde ele mora.
  --
  -- 9038 (5): no EXCLUIR, só a entrada da etiqueta excluída vira nula. A 0336
  -- escrevia `when v_remover then null` sem casar o nome, e excluir UMA etiqueta
  -- esvaziava `settings.tags` inteiro (todas as cores) e todas as sugestões de
  -- conversa da organização. Medido no invariante desta migration.
  -- Mesma guarda do ramo de renomear: `settings.tags` malformado não pode
  -- derrubar a cor (a leitura tolera; a escrita agora também).
  v_antes := case
    when jsonb_typeof(v_settings -> 'tags') = 'array' then v_settings -> 'tags'
    else '[]'::jsonb
  end;

  -- ── (e0) O AVISO DE JUNÇÃO — renomear NÃO é renome simples quando o nome
  -- já existe (issue #2801) ────────────────────────────────────────────────
  --
  -- Renomear para um nome que JÁ ESTÁ no vocabulário junta as duas entradas
  -- numa só, e a operação respondia `alterou: true` idêntico a um renome
  -- simples: a tela dizia "Etiqueta atualizada" enquanto duas etiquetas
  -- viravam uma. O marcador é medido AQUI, no vocabulário curado, e não na
  -- tela — a tela só tem a lista que ela mesma acabou de ler, e o caso
  -- justamente interessante é o que já vinha como DUAS linhas.
  --
  -- O alcance é declarado: `juntou` diz "duas ENTRADAS do vocabulário curado
  -- colapsaram". `juntar` um nome que só existia em uso (fora do vocabulário)
  -- não colapsa entrada nenhuma ali, e o marcador fica `false` — o que
  -- normalizou os nomes nesse caso foi `fn_tags_normalizar`, outro desenho.
  if not v_remover then
    select exists (
      select 1
      from jsonb_array_elements(v_antes) with ordinality as e(valor, ord)
      where btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}')) <> ''
      group by lower(
                case when lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
                     then v_destino
                     else btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))
                end
              )
      having count(*) > 1
    ) into v_juntou;
  end if;
  v_depois := coalesce(
    (
      select jsonb_agg(entrada.valor order by entrada.ord)
      from (
        -- Dedupe pela chave DEPOIS da substituição (mesma razão de
        -- `fn_tags_normalizar`): juntar duas entradas de chaves diferentes num
        -- nome só deixava as duas no vocabulário, agora com o mesmo `tag`.
        --
        -- ⚠️ `cor` e `descricao` da entrada sobrevivem ao rename: o `jsonb_set`
        -- mexe só em `{tag}`. Renomear não é perder a cor que alguém escolheu.
        select distinct on (lower(x.chave)) x.valor, x.ord
        from (
          select case
                   when v_remover and lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag) then null
                   when lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
                     then v_destino
                   else btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))
                 end as chave,
                 case
                   when v_remover and lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag) then null
                   when lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
                     then jsonb_set(
                            case when jsonb_typeof(e.valor) = 'string' then jsonb_build_object('tag', e.valor #>> '{}')
                                 else e.valor end,
                            '{tag}', to_jsonb(v_destino))
                   else case when jsonb_typeof(e.valor) = 'string' then jsonb_build_object('tag', e.valor #>> '{}')
                             else e.valor end
                 end as valor,
                 e.ord
          from jsonb_array_elements(v_antes) with ordinality as e(valor, ord)
          where btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}')) <> ''
        ) x
        where x.valor is not null and coalesce(x.chave, '') <> ''
        -- ⚠️ O DESEMPATE É PELO METADADO, ANTES DA ORDEM (issue #2801).
        --
        -- Com `order by lower(x.chave), x.ord` a primeira entrada pela posição
        -- ficava, COM OU SEM cor/descrição: renomear "a" (que tinha cor) para
        -- "b" (que existia antes, sem cor) PERDIA a cor que o operador havia
        -- escolhido — a entrada vazia de metadado vinha primeiro na lista.
        -- Este é o MESMO desempate da função de leitura
        -- (`fn_vocabulario_de_tags`) e do ramo `definir_cor`: onde a lista tem
        -- a mesma etiqueta duas vezes, sobrevive a que carrega metadado.
        --
        -- Quando as DUAS já têm metadado, o metadado não decide mais nada e o
        -- desempate volta a ser a ORDEM: fica a que já ocupava a posição no
        -- vocabulário — isto é, o destino. Cor contra cor tem de perder uma, e
        -- a regra escolhida preserva a identidade (nome + posição + cor) de
        -- quem já estava lá, em vez de deixar a posição da lista decidir
        -- qualquer coisa depois de virar empate técnico.
        order by lower(x.chave),
                 ((x.valor ->> 'cor') is not null or (x.valor ->> 'descricao') is not null) desc,
                 x.ord
      ) as entrada
      where entrada.valor is not null
    ),
    '[]'::jsonb
  );
  if v_depois <> v_antes then
    v_settings := jsonb_set(v_settings, '{tags}', v_depois);
    v_definido := true;
  end if;

  -- 9038 (1): as QUATRO listas de sugestão passam pela substituição que a 0336
  -- fazia só em `canonical_conversation_tags`. Cada uma é `array de text`
  -- (formato da 0244, mantido pela 9005); lista que não é lista é lista vazia,
  -- a mesma tolerância de `settings.tags` acima.
  foreach v_chave in array array[
    'canonical_conversation_tags',
    'archived_conversation_tags',
    'canonical_contact_tags',
    'archived_contact_tags'
  ]
  loop
    v_antes := case
      when jsonb_typeof(v_settings -> v_chave) = 'array' then v_settings -> v_chave
      else '[]'::jsonb
    end;
    v_depois := coalesce(
      (
        select jsonb_agg(semente.valor order by semente.ord)
        from (
          -- Dedupe pela chave DEPOIS da substituição, como acima.
          select distinct on (lower(y.valor)) y.valor, y.ord
          from (
            select case
                     when v_remover and lower(btrim(s.valor #>> '{}')) = lower(v_tag) then null
                     when lower(btrim(s.valor #>> '{}')) = lower(v_tag) then v_destino
                     else btrim(s.valor #>> '{}')
                   end as valor,
                   s.ord
            from jsonb_array_elements(v_antes) with ordinality as s(valor, ord)
            where btrim(s.valor #>> '{}') <> ''
          ) y
          where coalesce(y.valor, '') <> ''
          order by lower(y.valor), y.ord
        ) as semente
        where semente.valor is not null
      ),
      '[]'::jsonb
    );
    -- Só grava a chave que existia ou que mudou: organização que nunca teve a
    -- lista continua sem ela, em vez de ganhar quatro `[]` a cada operação.
    if v_depois <> v_antes and (v_settings ? v_chave or v_depois <> '[]'::jsonb) then
      v_settings := jsonb_set(v_settings, array[v_chave], v_depois);
      v_definido := true;
    end if;
  end loop;

  -- 9038 (1): sugerida vence arquivada no mesmo escopo — ver o cabeçalho.
  foreach v_escopo in array array['conversation', 'contact']
  loop
    v_sugeridas := case
      when jsonb_typeof(v_settings -> ('canonical_' || v_escopo || '_tags')) = 'array'
      then v_settings -> ('canonical_' || v_escopo || '_tags') else '[]'::jsonb
    end;
    v_arquivadas := case
      when jsonb_typeof(v_settings -> ('archived_' || v_escopo || '_tags')) = 'array'
      then v_settings -> ('archived_' || v_escopo || '_tags') else '[]'::jsonb
    end;
    v_depois := coalesce(
      (
        select jsonb_agg(a.valor order by a.ord)
        from jsonb_array_elements(v_arquivadas) with ordinality as a(valor, ord)
        where not exists (
          select 1 from jsonb_array_elements(v_sugeridas) as c(valor)
          where lower(btrim(c.valor #>> '{}')) = lower(btrim(a.valor #>> '{}'))
        )
      ),
      '[]'::jsonb
    );
    if v_depois <> v_arquivadas then
      v_settings := jsonb_set(v_settings, array['archived_' || v_escopo || '_tags'], v_depois);
      v_definido := true;
    end if;
  end loop;

  if v_definido then
    update public.organizations o
       set settings = v_settings,
           updated_at = now()
     where o.id = p_org;
  end if;

  return jsonb_build_object(
    'acao', p_acao,
    'tag', v_tag,
    'destino', nullif(v_destino, ''),
    'cor', null,
    'contatos', v_contatos,
    'leads', v_leads,
    'conversas', v_conversas,
    'regras', v_regras,
    -- `juntou` é o AVISO de que esta operação juntou duas etiquetas do
    -- vocabulário numa só (issue #2801). Sem ele a resposta era indistinguível
    -- de um renome simples, e a tela não tinha o que dizer. `false` no renome
    -- que não juntou, no excluir e em `juntar` cujo destino não estava no
    -- vocabulário curado (ver o bloco (e0)).
    'juntou', v_juntou,
    'alterou', (v_contatos + v_leads + v_conversas + v_regras > 0 or v_definido)
  );
end;
$$;

-- Doutrina 9: as duas origens de EXECUTE, com os mesmos grants da definição anterior.
revoke execute on function public.fn_vocabulario_de_tags_operar(uuid, text, text, text, text) from public, anon;
grant  execute on function public.fn_vocabulario_de_tags_operar(uuid, text, text, text, text) to authenticated, service_role;


-- ---- 2. fn_definir_marca_da_organizacao: accent_dark_hex com a régua de accent_hex (P2 da #215) ----
create or replace function public.fn_definir_marca_da_organizacao(
  p_org   uuid,
  p_actor uuid,
  p_marca jsonb
) returns integer
    language plpgsql
    volatile
    security definer
    set search_path to 'public', 'pg_temp'
as $$
declare
  v_linhas integer;
  v_hex    text;
  -- 9059: o par da cor no tema escuro (#2482, 0627) com a MESMA régua.
  v_hex_escuro text;
  v_limpar boolean;
begin
  if p_org is null or p_actor is null then
    raise exception 'marca_da_organizacao_argumento_nulo'
      using errcode = '22023';
  end if;

  v_limpar := p_marca is null or jsonb_typeof(p_marca) = 'null';

  if not v_limpar and jsonb_typeof(p_marca) <> 'object' then
    raise exception 'marca_da_organizacao_forma_invalida: %', jsonb_typeof(p_marca)
      using errcode = '22023';
  end if;

  v_hex := nullif(p_marca ->> 'accent_hex', '');
  if v_hex is not null and v_hex !~ '^#[0-9a-f]{6}$' then
    raise exception 'marca_da_organizacao_accent_hex_invalido'
      using errcode = '22023';
  end if;

  -- 9059: `accent_dark_hex` (a segunda semente do escuro, #2482) passa pela MESMA
  -- régua de `accent_hex`. Na instalação a coluna tem CHECK (0627,
  -- `platform_branding_accent_dark_hex`); na organização a cor mora no jsonb, onde
  -- não cabe CHECK de coluna, e a função aceitava qualquer texto — só a action
  -- (Zod + normalização) segurava.
  v_hex_escuro := nullif(p_marca ->> 'accent_dark_hex', '');
  if v_hex_escuro is not null and v_hex_escuro !~ '^#[0-9a-f]{6}$' then
    raise exception 'marca_da_organizacao_accent_dark_hex_invalido'
      using errcode = '22023';
  end if;

  if not exists (
       select 1 from public.user_organizations uo
        where uo.user_id = p_actor
          and uo.organization_id = p_org
          and uo.role = 'admin'
          and uo.revoked_at is null
     )
     and not exists (
       select 1 from public.platform_admins pa
        where pa.user_id = p_actor
          and pa.revoked_at is null
     )
  then
    raise exception 'marca_da_organizacao_sem_permissao'
      using errcode = '42501';
  end if;

  -- Nome/cor não podem injetar nem apagar os arquivos, que têm rota própria.
  update public.organizations o
     set settings = case
       when v_limpar
         and coalesce(o.settings #>> '{branding,logo_path}', '') = ''
         and coalesce(o.settings #>> '{branding,logo_dark_path}', '') = ''
       then coalesce(o.settings, '{}'::jsonb) - 'branding'
       else jsonb_set(
       coalesce(o.settings, '{}'::jsonb), '{branding}',
       (case when v_limpar then '{}'::jsonb
             else p_marca - 'logo_path' - 'logo_dark_path' end)
       || jsonb_strip_nulls(jsonb_build_object(
         'logo_path', o.settings #> '{branding,logo_path}',
         'logo_dark_path', o.settings #> '{branding,logo_dark_path}'
       )), true) end
   where o.id = p_org;

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

revoke execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
