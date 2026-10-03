-- 9026 — o dono do servidor libera módulo opcional empresa por empresa.
--
-- O upstream tem duas chaves: o MÓDULO da instalação (`platform_config`, o dono
-- do servidor decide para todas as empresas) e a CAPACIDADE da organização
-- (`organizations.settings`, o admin da empresa decide para si). Falta a do
-- meio, pedida pelo Peterson em 02/10/2026: "eu, como dono, libero o recurso
-- para determinadas contas; quem não precisa não fica com páginas sem uso".
--
-- Vale só para os módulos que o código marca como "exige liberação"
-- (`MODULOS_LIBERADOS_POR_EMPRESA` em `lib/organizacao/modulos-liberados.ts`).
-- Os módulos que já existem não leem esta tabela: nenhuma empresa perde nada.
--
-- Por que tabela própria, e não uma chave em `organizations.settings`: o admin
-- da empresa grava em `organizations` pelo service role (`updateTenant`,
-- `atualizarInterfaceDaEmpresa`, issue #144). Uma chave ali ficaria ao alcance
-- de quem a liberação existe para conter. Aqui só o service role escreve, e o
-- único caminho de escrita é a action de platform admin.
--
-- Linha presente = liberado. Liberar de novo não duplica (PK); revogar apaga a
-- linha. O histórico mora no `api_audit_log` (`platform.modulo_liberado`).

create table if not exists public.modulos_liberados_por_empresa (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  modulo text not null check (modulo ~ '^[a-z][a-z0-9_]{1,39}$'),
  liberado_por uuid references auth.users(id) on delete set null,
  liberado_em timestamptz not null default now(),
  primary key (organization_id, modulo)
);

comment on table public.modulos_liberados_por_empresa is
  'Módulos opcionais que o dono do servidor liberou para cada empresa (9026). Escrita só pelo service role.';

alter table public.modulos_liberados_por_empresa enable row level security;

-- Membro LÊ o que a própria empresa tem liberado (o layout de /app decide o menu
-- com isso). Nenhuma policy de escrita: authenticated não grava, nem com GRANT.
drop policy if exists modulos_liberados_select on public.modulos_liberados_por_empresa;
create policy modulos_liberados_select on public.modulos_liberados_por_empresa
  for select using (organization_id in (select public.fn_user_org_ids()));

revoke all on table public.modulos_liberados_por_empresa from anon, authenticated;
grant select on table public.modulos_liberados_por_empresa to authenticated;
grant all on table public.modulos_liberados_por_empresa to service_role;
