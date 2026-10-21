-- 9061: foto de perfil da pessoa e foto da organização.
--
-- Prova: app/api/v1/perfil/foto/route.test.ts, app/api/v1/organizacao/foto/route.test.ts
-- e as rotas de leitura (controle negativo: outra pessoa, outra organização).
-- `local`: vale só nesta transação (o runner aplica cada migration numa),
-- e não vaza para as migrations seguintes da mesma conexão.
set local lock_timeout = '3s';

-- ---- foto de perfil da pessoa e foto da organização (migration 9061) ----
--
-- Pedido do Peterson (20/10/2026): a tela de Perfil sobe a FOTO da pessoa (no
-- lugar da "Avatar URL — upload em breve") e a tela Organização sobe a FOTO da
-- empresa, que aparece no lugar da sigla no trilho, no seletor de organização e
-- no celular. Não confundir com a marca white-label (`brand-logos`, 0158): essa
-- é do admin da plataforma; esta é do admin da empresa.
--
-- 1 · bucket `fotos-de-perfil`, PRIVADO, 1 MB, PNG/JPEG/WebP. NENHUMA policy em
--     `storage.objects` para ele, de propósito: só o service_role escreve (rotas
--     `/api/v1/perfil/foto` e `/api/v1/organizacao/foto`, depois dos gates) e só
--     o service_role assina leitura (rotas `/api/v1/usuarios/[id]/foto` e
--     `/api/v1/organizacoes/[id]/foto`, que conferem vínculo e redirecionam
--     para URL assinada de 5 min). Caminhos: `usuarios/<user_id>/<uuid>.<ext>` e
--     `organizacoes/<org_id>/<uuid>.<ext>`.
-- 2 · `organizations.foto_path` (nula) + CHECK que só aceita caminho DA PRÓPRIA
--     organização: vale também para quem escrevesse direto pelo PostgREST.
--     O ponteiro da foto da PESSOA não mora em tabela: fica em
--     `auth.users.raw_app_meta_data->>'avatar_path'` (só a admin API escreve).
--
-- Ordem do deploy: migration ANTES do app (o app novo lê `organizations.foto_path`
-- no embed das memberships de toda requisição).
-- Idempotente (`on conflict`, `if not exists`, CHECK criado só quando falta).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-de-perfil', 'fotos-de-perfil', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.organizations add column if not exists foto_path text;
-- Só quando falta: `organizations` é lida em toda requisição, e um drop/add a
-- cada reaplicação do baseline pediria ACCESS EXCLUSIVE nela em todo deploy.
do $foto$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.organizations'::regclass
       and conname = 'organizations_foto_path_da_propria_org'
  ) then
    alter table public.organizations add constraint organizations_foto_path_da_propria_org check (
      foto_path is null
      or foto_path ~ ('^organizacoes/' || id::text
                      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$')
    );
  end if;
end $foto$;
comment on column public.organizations.foto_path is
  'Foto da organização em storage/fotos-de-perfil (privado), sempre organizacoes/<id>/<uuid>.<png|jpg|webp>. Aparece no lugar da sigla na casca. Escrito só por app/api/v1/organizacao/foto (admin da empresa). Migration 9061.';

notify pgrst, 'reload schema';
