-- manifest: prospecting_candidates.automatic_sends + exit_offered_at — saída da prospecção na 1ª, 2ª ou 3ª mensagem
alter table public.prospecting_candidates
  add column if not exists automatic_sends smallint not null default 0,
  add column if not exists exit_offered_at timestamptz;
