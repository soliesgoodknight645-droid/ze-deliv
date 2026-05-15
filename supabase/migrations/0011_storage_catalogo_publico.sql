-- =============================================================
-- Bucket "catalogo" PUBLICO + policies
--
-- Por que: o admin sobe foto do produto via uploadImagemProduto e
-- recebe uma URL HTTPS (storage.getPublicUrl). Se o bucket estiver
-- privado, o GET dessa URL no navegador devolve 400/404 e a foto
-- nao aparece no site, mesmo com a URL correta salva no banco.
--
-- Esta migration:
--   1. Garante que o bucket "catalogo" existe.
--   2. Marca o bucket como public = true.
--   3. Cria policy de SELECT publica (qualquer um pode ler).
--   4. Cria policy de INSERT/UPDATE/DELETE so pra service_role
--      (o admin atua via createSupabaseAdmin que ja usa service_role).
-- =============================================================

-- 1. cria bucket se nao existir
insert into storage.buckets (id, name, public)
values ('catalogo', 'catalogo', true)
on conflict (id) do update set public = excluded.public;

-- 2. garante public = true mesmo se ja existia
update storage.buckets set public = true where id = 'catalogo';

-- 3. policies (drop+create pra ser idempotente)
drop policy if exists "Public read access for catalogo bucket" on storage.objects;
create policy "Public read access for catalogo bucket"
  on storage.objects for select
  using (bucket_id = 'catalogo');

drop policy if exists "Service role can write to catalogo bucket" on storage.objects;
create policy "Service role can write to catalogo bucket"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'catalogo');

drop policy if exists "Service role can update catalogo bucket" on storage.objects;
create policy "Service role can update catalogo bucket"
  on storage.objects for update
  to service_role
  using (bucket_id = 'catalogo');

drop policy if exists "Service role can delete catalogo bucket" on storage.objects;
create policy "Service role can delete catalogo bucket"
  on storage.objects for delete
  to service_role
  using (bucket_id = 'catalogo');
