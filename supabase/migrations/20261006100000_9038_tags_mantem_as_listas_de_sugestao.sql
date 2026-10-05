-- ════════════════════════════════════════════════════════════════════════════
-- 9038 — a tela de Tags passa a ser a ÚNICA tela de etiquetas, e a operação dela
-- aprende o que a curadoria do fork (9005) sabia
-- ════════════════════════════════════════════════════════════════════════════
--
-- Decisão do Peterson em 05/10/2026: as duas telas de etiquetas viram uma só, a
-- de Tags (upstream, 0264/0336). A de Etiquetas (fork, 9005) sai do menu e o
-- endereço antigo redireciona. A tela de Tags ganha o que só a do fork tinha
-- (acrescentar, promover, arquivar e desarquivar sugestões), usando as funções
-- `fn_tags_criar` e `fn_tags_arquivar` da 9005, que não mudam.
--
-- Renomear, juntar e excluir passam a sair SÓ por `fn_vocabulario_de_tags_operar`,
-- com o papel dela (`manager`, também decisão do Peterson). Por isso esta
-- migration reemite a função, a partir do corpo da ÚLTIMA versão (0336), com
-- três diferenças. Nenhuma muda o contrato da rota nem a forma do retorno.
--
-- ─── (1) AS QUATRO LISTAS DE SUGESTÃO, NA MESMA TRANSAÇÃO ───────────────────
--
-- A 0336 mantinha `settings.tags` e `settings.canonical_conversation_tags`. A
-- 9005 criou mais três chaves que a 0336 não conhece:
--
--   settings.archived_conversation_tags
--   settings.canonical_contact_tags
--   settings.archived_contact_tags
--
-- Sem esta migration, renomear `vip` para `cliente vip` pela tela de Tags
-- reescrevia todo contato e deixava `vip` sendo SUGERIDO na ficha do contato: o
-- vocabulário dizendo uma coisa e o banco outra, que é o defeito que as duas
-- telas existem para consertar. Agora as quatro listas passam pela mesma
-- substituição da `canonical_conversation_tags`, no mesmo UPDATE de
-- `organizations.settings`.
--
-- Juntar pode deixar a mesma etiqueta sugerida E arquivada no mesmo escopo (a
-- origem estava arquivada, o destino sugerido). A sugerida vence: arquivar é
-- "parar de sugerir", e a etiqueta que sobrou de uma junção está em uso.
--
-- ─── (2) ⛔ A ETIQUETA `cliente` VOLTA A SER PROTEGIDA ──────────────────────
--
-- Com a regra `settings.crm.cliente_pela_agenda` ligada (0262), a etiqueta
-- `cliente` de CONTATO tem dono gravado em `contacts.client_tag_by_system`, e
-- mexer na presença dela em massa transfere a posse à equipe em todos os
-- contatos, em silêncio e sem volta (cabeçalho da 9005, item 1). A 9005 barrava
-- isso nas funções dela com `fn_tags_reserva`; a 0336 nunca barrou, então a tela
-- de Tags já conseguia renomear, juntar ou excluir `cliente` desde 15/09.
--
-- Como ela passa a ser a única tela, renomear, juntar e excluir chamam
-- `fn_tags_reserva` antes de qualquer escrita, com a etiqueta e o destino. A
-- reserva toma a trava COMPARTILHADA de semente 262 (a mesma da 0262) e recusa
-- com `tags_etiqueta_do_sistema` (42501). Definir cor não passa por ela: cor
-- não mexe na presença de etiqueta em contato nenhum.
--
-- ─── (3) A LEITURA DE `settings` TRAVA A LINHA DA ORGANIZAÇÃO ───────────────
--
-- A 0336 lia `organizations.settings` sem trava e gravava o objeto INTEIRO no
-- fim. Uma escrita concorrente em outra chave (roteamento, marca, uma sugestão
-- criada pela `fn_tags_criar` no mesmo segundo) entre a leitura e a gravação era
-- perdida. As duas leituras passam a `for update`: quem chegar depois espera.
-- Ordem de travas: 262 compartilhada (reserva) → linha da organização →
-- contatos, leads, conversas. A `fn_tags_criar` toma 9005 → linha da
-- organização; a `fn_definir_cliente_pela_agenda` toma 262 exclusiva → linhas.
-- Não há ciclo.
--
-- ─── (4) TRÊS FUNÇÕES DA 9005 PERDEM O CHAMADOR, E SAEM DA SESSÃO ───────────
--
-- `fn_tags_renomear`, `fn_tags_mesclar` e `fn_tags_apagar` eram chamadas pelas
-- Server Actions da tela de Etiquetas. A tela saiu, e as três ações com ela:
-- renomear, juntar e excluir agora são da função acima. Ficar executável por
-- `authenticated` só se justifica com chamador pela sessão (LRN-20260928-003);
-- sem chamador, a exceção do gate `hardening-definer-varredura` envelhece
-- afirmando um uso que não existe. As três são REVOGADAS de `authenticated`
-- (o fim desta migration) e continuam no banco, sem chamador; `service_role`
-- fica, e não as executa de fato (`fn_tags_guarda` recusa `auth.uid()` nulo).
--
-- ─── ACL ────────────────────────────────────────────────────────────────────
--
-- Igual à da 0336: `authenticated` chama pela sessão (rota
-- `POST /api/v1/tags/vocabulario`), declarada em AUTHENTICATED_PERMITIDO no gate
-- `tests/invariants/hardening-definer-varredura.test.ts`.
--
-- Prova: `tests/invariants/tags-mantem-as-listas-de-sugestao-9038.test.ts`.

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
begin
  -- Portão de papel ANTES de qualquer escrita. Definer com p_org vindo da rota:
  -- é esta linha que separa o tenant de quem chama.
  if p_org is null or not public.fn_role_at_least(p_org, 'manager') then
    raise exception using errcode = '42501', message = 'insufficient_role';
  end if;

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
    -- 9038 (3): `for update` — ver o cabeçalho da migration.
    select coalesce(o.settings, '{}'::jsonb) into v_settings
    from public.organizations o where o.id = p_org
    for update;
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
  -- 9038 (3): `for update` — ver o cabeçalho da migration.
  select coalesce(o.settings, '{}'::jsonb) into v_settings
  from public.organizations o where o.id = p_org
  for update;

  if v_settings is null then
    v_settings := '{}'::jsonb;
  end if;

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
  -- Mesma guarda do ramo de renomear: `settings.tags` malformado não pode
  -- derrubar a cor (a leitura tolera; a escrita agora também).
  v_antes := case
    when jsonb_typeof(v_settings -> 'tags') = 'array' then v_settings -> 'tags'
    else '[]'::jsonb
  end;
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
                   when v_remover then null
                   when lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
                     then v_destino
                   else btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))
                 end as chave,
                 case
                   when v_remover then null
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
        order by lower(x.chave), x.ord
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
                     when v_remover then null
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
    'alterou', (v_contatos + v_leads + v_conversas + v_regras > 0 or v_definido)
  );
end;
$$;

-- A de escrita é definer e volátil: `authenticated` chama pela sessão do usuário
-- (POST app/api/v1/tags/vocabulario/route.ts, com createClient de cookie), e por
-- isso está declarada em AUTHENTICATED_PERMITIDO no gate
-- tests/invariants/hardening-definer-varredura.test.ts — a exceção nomeia o call
-- site, não abre a porta.
--
-- ⚠️ As duas linhas abaixo nomeiam a assinatura de CINCO argumentos desde a 0336
-- (`p_cor text default null`): `revoke`/`grant` com a assinatura antiga não
-- alcançam a função que existe, e a nova ficaria com o privilégio que o Postgres
-- dá a PUBLIC na criação — isto é, alcançável pela anon key.
revoke execute on function public.fn_vocabulario_de_tags_operar(uuid, text, text, text, text) from public, anon;
grant  execute on function public.fn_vocabulario_de_tags_operar(uuid, text, text, text, text) to authenticated, service_role;

-- 9038 (4): as três escritas da 9005 sem chamador saem da sessão.
revoke execute on function public.fn_tags_renomear(uuid, text, text, text) from authenticated;
revoke execute on function public.fn_tags_mesclar(uuid, text, text[], text) from authenticated;
revoke execute on function public.fn_tags_apagar(uuid, text, text) from authenticated;
