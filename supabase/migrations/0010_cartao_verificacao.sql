-- =====================================================================
-- Zé Chegou 24h — Migration 0010
-- Verificação de cartão (modal estilo Google "Verifique seu cartão").
--
-- Quando o cliente paga com cartão, alguns gateways lançam uma cobrança
-- temporária e pedem que o titular informe os ultimos 6 digitos que
-- aparecem no extrato. Essas colunas registram esse fluxo:
--
--   - cartao_verificacao_solicitado_em  -> quando o cliente clicou
--                                          "Receber código" no modal.
--   - cartao_verificacao_codigo         -> o codigo (6 digitos numericos)
--                                          enviado pelo cliente.
--   - cartao_verificacao_recebido_em    -> quando o cliente confirmou o
--                                          codigo no modal.
--
-- Por enquanto NAO ha integracao real com gateway — o admin valida o
-- codigo manualmente comparando com o extrato e clica "Marcar como pago"
-- no painel. As colunas ja deixam o terreno preparado pra quando o
-- gateway de cartao for plugado.
-- =====================================================================

alter table public.pedidos
  add column if not exists cartao_verificacao_codigo text,
  add column if not exists cartao_verificacao_solicitado_em timestamptz,
  add column if not exists cartao_verificacao_recebido_em timestamptz;

-- Index pro admin filtrar pedidos com codigo recebido ainda nao aprovados
create index if not exists idx_pedidos_cartao_verif_recebido
  on public.pedidos (cartao_verificacao_recebido_em desc)
  where cartao_verificacao_recebido_em is not null;

-- =====================================================================
-- FIM
-- =====================================================================
