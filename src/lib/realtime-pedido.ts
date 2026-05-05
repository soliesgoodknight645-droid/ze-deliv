import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { canalPedido, type PedidoStatusBroadcast } from "./realtime-pedido-shared";

export { canalPedido, type PedidoStatusBroadcast };

/**
 * Canal de Realtime usado pra o navegador do cliente saber instantaneamente
 * quando o status de um pedido mudou (admin marcou pago, webhook do gateway,
 * etc.). Não usamos `postgres_changes` porque a tabela `pedidos` tem RLS que
 * só libera SELECT pra admin — `broadcast` é pubsub puro e não depende disso.
 */

/**
 * Envia um broadcast no canal do pedido. Chamado depois de qualquer update
 * server-side em `pedidos.status` (admin manual, webhook de gateway, polling
 * que descobriu mudança no gateway, etc.).
 *
 * Não falha o fluxo do caller — qualquer erro é apenas logado.
 */
export async function broadcastStatusPedido(
  sb: SupabaseClient,
  numero: string,
  payload: PedidoStatusBroadcast,
): Promise<void> {
  if (!numero) return;
  const channel = sb.channel(canalPedido(numero), {
    config: { broadcast: { self: true, ack: false } },
  });
  try {
    await channel.subscribe();
    await channel.send({
      type: "broadcast",
      event: "status",
      payload,
    });
  } catch (e) {
    console.error("[realtime-pedido] broadcast falhou", e);
  } finally {
    try {
      await sb.removeChannel(channel);
    } catch {
      /* ignora */
    }
  }
}
