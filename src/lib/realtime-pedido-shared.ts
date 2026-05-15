/**
 * Constantes/tipos compartilhados pelo canal de Realtime do pedido.
 * Sem `server-only` pra poder ser usado no client (subscribe).
 */
export function canalPedido(numero: string): string {
  return `pedido:${numero}`;
}

export type PedidoStatusBroadcast = {
  status: string;
  paid_at?: string | null;
  gateway_status?: string | null;
};

/**
 * Canal global ouvido pelo painel admin pra alertas em tempo real (toca som
 * quando entra pedido com cartão, etc.). Independente de pedido especifico.
 */
export const CANAL_ADMIN_ALERTAS = "admin:alertas";

export type AdminAlertaNovoPedido = {
  tipo: "novo_pedido";
  numero: string;
  forma_pagamento: "pix" | "card" | "cash" | string;
  total: number;
  cliente_nome?: string | null;
  criado_em: string;
};
