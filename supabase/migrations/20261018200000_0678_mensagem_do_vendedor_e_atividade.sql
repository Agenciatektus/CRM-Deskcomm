-- manifest: **A fala HUMANA do vendedor passa a ser atividade do negócio (issue #2953).** O defeito medido pelo reportador: `crm_leads.last_activity_at` só muda por `fn_update_last_activity_at`, que é o gatilho `trg_update_last_activity_at` em `crm_lead_activities`; a mensagem do vendedor não cria linha lá, e `fn_mark_conversation_message` carimba apenas `contacts.last_activity_at`. Então o negócio trabalhado todo dia (pelo Inbox ou pelo celular) seguia com o relógio parado, e o radar de risco (`lib/leads/radar-de-risco.ts`) — que ordena por `last_activity_at` — o listava como FRIO. Gatilho NOVO em `messages`, sem tocar em nenhuma função existente: `fn_mensagem_do_vendedor_e_atividade`, `security definer` com `search_path` fixo, EXECUTE revogado de public/anon/authenticated e concedido só a service_role. O `when` do gatilho só deixa entrar fala humana de SAÍDA — `sent_via in ('user','crm','external_device')`, `direction = 'outbound'`, `type not in ('reaction','system')` e sem `metadata.historico_importado = 'true'` (IA, automação, reação, aviso de sistema, histórico importado e a fala do CLIENTE ficam de fora). Carimba SÓ os negócios `status = 'open'` do MESMO contato e da MESMA organização, e nunca retrocede a data (`coalesce(last_activity_at,'-infinity') < new.created_at`). Gate: `tests/invariants/mensagem-do-vendedor-e-atividade.test.ts`, que mede comportamento em Postgres real nos cinco casos do critério mais reação, sistema, histórico importado, outro contato, outra organização, negócio fechado e o relógio que não anda para trás. Corpo inteiro espelhado, byte a byte, no apêndice de `supabase/baseline.sql`.

-- ---- a mensagem do vendedor é atividade do negócio (migration 0678, issue #2953) ----
-- O DEFEITO, medido por quem reportou: `crm_leads.last_activity_at` só muda por
-- `fn_update_last_activity_at`, que é o gatilho `trg_update_last_activity_at` em
-- `crm_lead_activities`. A mensagem do vendedor não cria linha lá, e
-- `fn_mark_conversation_message` carimba apenas `contacts.last_activity_at`.
-- Resultado: o negócio trabalhado todo dia — pelo Inbox ou pelo celular
-- conectado — seguia com o relógio parado, e o radar de risco
-- (`lib/leads/radar-de-risco.ts`, que ordena e mede por `last_activity_at`) o
-- listava como FRIO. Alarme falso é o defeito caro aqui: ele ensina quem opera a
-- desconfiar do radar inteiro.
--
-- A REGRA: a fala HUMANA do vendedor quebra o silêncio do negócio. "Humana" é o
-- vocabulário que o resto do produto já usa para separar gente de máquina —
-- `sent_via in ('user', 'crm', 'external_device')`, isto é, o Inbox do CRM e o
-- aparelho conectado.
--
-- CADA LINHA DO `when` QUE VAI ALÉM DE `sent_via`, com sua razão:
--   direction = 'outbound'     A mensagem do CLIENTE não é trabalho do vendedor.
--                              Cliente escrevendo e vendedor calado é o negócio
--                              em risco que o radar EXISTE para apontar: se
--                              inbound carimbasse, o radar ficaria cego
--                              exatamente no caso que ele deve mostrar.
--   type not in ('reaction')   reação de emoji não é fala;
--   type not in ('system')     aviso do sistema/canal não é fala;
--   histórico importado        conversa trazida de fora é passado, não
--                              atendimento de agora. A chave é acordada com quem
--                              importa: `metadata.historico_importado = 'true'`.
--
-- NUNCA RETROCEDE: o `where` casa só negócio cujo relógio é MAIS ANTIGO que a
-- mensagem (`coalesce(last_activity_at, '-infinity') < new.created_at`). Relógio
-- já mais novo fica intocado — nem escrita inútil em `updated_at`. É a mesma
-- assimetria que a 0079 declara: o relógio do negócio só anda para frente.
--
-- SEM TOQUE NO QUE JÁ EXISTE: `fn_update_last_activity_at` e
-- `fn_mark_conversation_message` ficam como estão. Este é um gatilho NOVO, em
-- outra tabela, com função própria — a lista positiva de tipos de
-- `crm_lead_activities` continua sendo a única régua do que conta como
-- atividade lá.
--
-- `security definer` com `search_path` fixo: o INSERT em `messages` chega tanto
-- com a sessão do usuário quanto com o service role, e o carimbo do negócio não
-- pode depender da policy de quem enviou. O EXECUTE é revogado de public/anon/
-- authenticated e concedido só a service_role — o `alter default privileges` do
-- baseline concede a anon e authenticated toda função nova, então sem o revoke
-- esta nasceria exposta.

create or replace function public.fn_mensagem_do_vendedor_e_atividade()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  update public.crm_leads l
     set last_activity_at = new.created_at
   where l.organization_id = new.organization_id
     and l.contact_id = new.contact_id
     and l.status = 'open'
     and coalesce(l.last_activity_at, '-infinity'::timestamptz) < new.created_at;
  return new;
end$fn$;

comment on function public.fn_mensagem_do_vendedor_e_atividade() is
  'Gatilho de `messages`: a fala humana do vendedor (sent_via em user/crm/external_device, outbound, sem reação/sistema/histórico importado) carimba `crm_leads.last_activity_at` dos negócios ABERTOS do contato, na mesma organização, e nunca retrocede a data. Existe porque `crm_lead_activities` nunca recebeu linha de mensagem e o radar de risco lia o negócio trabalhado como frio (#2953).';

revoke execute on function public.fn_mensagem_do_vendedor_e_atividade() from public, anon, authenticated;
grant execute on function public.fn_mensagem_do_vendedor_e_atividade() to service_role;

drop trigger if exists trg_mensagem_do_vendedor_e_atividade on public.messages;
create trigger trg_mensagem_do_vendedor_e_atividade
  after insert on public.messages
  for each row
  when (new.direction = 'outbound'
        and new.sent_via in ('user', 'crm', 'external_device')
        and new.type not in ('reaction', 'system')
        and coalesce(new.metadata ->> 'historico_importado', '') <> 'true')
  execute function public.fn_mensagem_do_vendedor_e_atividade();

notify pgrst, 'reload schema';
