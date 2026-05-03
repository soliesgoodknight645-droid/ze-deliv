-- =====================================================================
-- Zé Chegou 24h — Migration 0008
-- Suporte a cupom de upsell (roleta pos-pagamento).
-- Quem ganha 50% OFF na roleta faz um "segundo pedido" que vai junto com o
-- primeiro pra entrega unica. Salvamos:
--   - cupom_codigo / cupom_desconto: rastreamento financeiro
--   - pedido_ref: numero do pedido original que destravou o cupom
-- =====================================================================

alter table public.pedidos
  add column if not exists cupom_codigo text,
  add column if not exists cupom_desconto numeric(10, 2) not null default 0,
  add column if not exists pedido_ref text;

create index if not exists idx_pedidos_pedido_ref
  on public.pedidos (pedido_ref)
  where pedido_ref is not null;

-- =====================================================================
-- FIM
-- =====================================================================
