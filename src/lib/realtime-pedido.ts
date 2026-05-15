import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CANAL_ADMIN_ALERTAS,
  canalPedido,
  type AdminAlertaNovoPedido,
  type PedidoStatusBroadcast,
} from "./realtime-pedido-shared";

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

/**
 * Broadcast no canal global do admin pra alertar de novos pedidos
 * (toca som no painel quando o admin esta logado e ativou alertas).
 * Nao trava o fluxo do checkout — qualquer erro eh apenas logado.
 */
export async function broadcastAlertaAdmin(
  sb: SupabaseClient,
  payload: AdminAlertaNovoPedido,
): Promise<void> {
  const channel = sb.channel(CANAL_ADMIN_ALERTAS, {
    config: { broadcast: { self: true, ack: false } },
  });
  try {
    await channel.subscribe();
    await channel.send({
      type: "broadcast",
      event: "novo_pedido",
      payload,
    });
  } catch (e) {
    console.error("[realtime-admin] broadcast falhou", e);
  } finally {
    try {
      await sb.removeChannel(channel);
    } catch {
      /* ignora */
    }
  }
}
