-- manifest: 9077 — corrige a 9076: desfaz a marca inclui_ia em plano que nao e BRL e cria a trava inclui_ia x ia_propria (not valid: nao reescreve linha existente). Aditiva e idempotente. Apendice igual no baseline.sql.
--
-- 9077: a 9076 marcou por preco_cents = 39700 sem olhar a moeda; 39700 centavos so e R$ 397 em BRL.
-- E um plano nao pode incluir IA (chave da plataforma) e ser de IA propria (que a proibe) ao mesmo tempo.
-- Reverter: alter table public.cobranca_planos drop constraint if exists cobranca_planos_ia_exclusivos;

set lock_timeout = '3s';

update public.cobranca_planos
   set inclui_ia = false
 where preco_cents = 39700
   and moeda <> 'BRL'
   and inclui_ia = true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'cobranca_planos_ia_exclusivos'
       and conrelid = 'public.cobranca_planos'::regclass
  ) then
    alter table public.cobranca_planos
      add constraint cobranca_planos_ia_exclusivos check (not (inclui_ia and ia_propria)) not valid;
  end if;
end
$$;

notify pgrst, 'reload schema';
