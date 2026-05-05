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
