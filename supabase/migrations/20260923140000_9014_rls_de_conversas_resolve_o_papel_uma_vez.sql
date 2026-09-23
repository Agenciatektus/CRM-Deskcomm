-- 9014 — a RLS de conversas resolve o papel UMA vez, não duas.
--
-- ─── O piso que sobrou da 9013 ────────────────────────────────────────────
-- A 9013 consertou o campo computado (7.914 → 3.547 buffers). O que restou é
-- o mesmo defeito com outra roupa: função STABLE chamada por linha fazendo
-- mais acesso do que precisa.
--
-- `fn_can_view_conversation` é o predicado da RLS de `conversations` — roda
-- uma vez POR LINHA em toda leitura do Inbox — e chamava
-- `fn_user_role_in_org(p_org)` DUAS vezes na mesma expressão CASE. Cada
-- chamada dela executa `fn_support_context()` mais uma consulta a
-- `user_organizations`.
--
-- Medido na produção do Dr. Paulo, com a função no WHERE (que a executa em
-- cima da policy, por isso os números são maiores que os da policy sozinha):
--
--   antes ..... 1.089 buffers,  78 ms
--   depois ....   685 buffers,  73 ms
--
-- O ganho é de I/O lógico (-37%), não de relógio: o tempo praticamente não
-- muda nesta base. Buffer a menos importa sob CONCORRÊNCIA — menos páginas
-- tocadas por requisição é menos contenção quando várias pessoas abrem o
-- Inbox ao mesmo tempo, que é o cenário do cliente.
--
-- ─── EQUIVALÊNCIA PROVADA, e nos ramos que a amostra não cobre ────────────
-- 72 casos: todo vínculo vivo × cada um dos três `visibility_mode` (incluindo
-- um valor desconhecido) × `assigned` nulo, próprio e de terceiro.
-- ZERO divergências. O ramo do `agent` com `visibility_mode` variando é
-- justamente o que as 168 conversas reais não exercitam.
--
-- ─── O que testei e NÃO valeu ─────────────────────────────────────────────
-- Resolver o `visibility_mode` no mesmo subselect do papel: 697 buffers,
-- empate com os 685 desta versão. A leitura de `organizations` não é o
-- gargalo que eu supunha — a dupla chamada de `fn_user_role_in_org` era.
-- Fica registrado para ninguém tentar de novo achando que ganha.
--
-- ─── ⚠️ O que NÃO pode ser 'otimizado' aqui ───────────────────────────────
-- `SECURITY DEFINER` e `SET search_path` FICAM. Função `language sql` com
-- cláusula SET nunca é inlineada pelo planejador, e é verdade que remover o
-- SET aceleraria — mas esta função decide QUEM VÊ QUAL CONVERSA, e sem o
-- `search_path` fixo ela fica aberta a sequestro de caminho. Quem ler que
-- 'remover o SET acelera' e aplicar em massa abre escalada de privilégio na
-- função mais sensível do Inbox.

create or replace function public.fn_can_view_conversation(
  p_org uuid,
  p_assigned_to_user_id uuid
) returns boolean
language sql stable security definer
set search_path = public
as $function$
  select case
    when public.fn_is_platform_admin() then true
    else (
      select case
        when s.papel is null then false
        when s.papel in ('viewer','manager','admin') then true
        when p_assigned_to_user_id = auth.uid() then true
        else case coalesce(
               (select settings->>'visibility_mode' from public.organizations where id = p_org),
               'own_and_unassigned')
             when 'all' then true
             when 'own_and_unassigned' then p_assigned_to_user_id is null
             else false
             end
      end
      from (select public.fn_user_role_in_org(p_org) as papel) s
    )
  end;
$function$;

notify pgrst, 'reload schema';
