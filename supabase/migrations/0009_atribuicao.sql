-- =====================================================================
-- Zé Chegou 24h — Migration 0009
-- Sistema nativo de atribuição de tráfego pago/orgânico.
-- Salvamos a atribuição capturada no first-click (cookies/localStorage)
-- diretamente no pedido para alimentar o dashboard interno do admin.
-- =====================================================================

alter table public.pedidos
  add column if not exists traffic_source text,
  add column if not exists traffic_medium text,
  add column if not exists traffic_campaign text,
  add column if not exists traffic_adgroup text,
  add column if not exists traffic_keyword text,
  add column if not exists traffic_searchterm text,
  add column if not exists traffic_matchtype text,
  add column if not exists traffic_device text,
  add column if not exists traffic_creative text,
  add column if not exists traffic_gclid text,
  add column if not exists traffic_landing_page text,
  add column if not exists traffic_referrer text,
  add column if not exists first_visit_at timestamptz,
  add column if not exists conversion_at timestamptz;

-- Índices para os rankings do dashboard
create index if not exists idx_pedidos_traffic_source
  on public.pedidos (traffic_source)
  where traffic_source is not null;

create index if not exists idx_pedidos_traffic_campaign
  on public.pedidos (traffic_campaign)
  where traffic_campaign is not null;

create index if not exists idx_pedidos_traffic_adgroup
  on public.pedidos (traffic_adgroup)
  where traffic_adgroup is not null;

create index if not exists idx_pedidos_traffic_keyword
  on public.pedidos (traffic_keyword)
  where traffic_keyword is not null;

create index if not exists idx_pedidos_traffic_gclid
  on public.pedidos (traffic_gclid)
  where traffic_gclid is not null;

-- Quando o pedido é criado, conversion_at = criado_em.
-- Atualizamos o paid_at via webhook (ja existente) — independente.
update public.pedidos
   set conversion_at = criado_em
 where conversion_at is null;

-- =====================================================================
-- FIM
-- =====================================================================
