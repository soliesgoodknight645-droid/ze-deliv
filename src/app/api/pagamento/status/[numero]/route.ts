import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { pedidoStatusEhPosPagamento } from "@/lib/pedido-status";
import { broadcastStatusPedido } from "@/lib/realtime-pedido";
import { consultarStatusPedido, type GatewayId } from "@/lib/pagamento/gateway";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

type Params = { numero: string };

export async function GET(_req: Request, { params }: { params: Promise<Params> }) {
  const { numero } = await params;
  const sb = createSupabaseAdmin();

  const { data: pedido } = await sb
    .from("pedidos")
    .select("id, status, gateway_id, gateway_status, gateway_pagamento, paid_at")
    .eq("numero", numero)
    .maybeSingle();

  if (!pedido) {
    return json({ erro: "pedido nao encontrado" }, 404);
  }

  if (pedidoStatusEhPosPagamento(pedido.status as string)) {
    return json({
      status: pedido.status,
      gatewayStatus: pedido.gateway_status,
      paidAt: pedido.paid_at,
    });
  }

  if (pedido.status === "cancelado") {
    return json({
      status: pedido.status,
      gatewayStatus: pedido.gateway_status,
      paidAt: pedido.paid_at,
    });
  }

  // Fallback do webhook: consulta o gateway que processou esse pedido
  try {
    const r = await consultarStatusPedido({
      numero,
      gateway_pagamento: (pedido.gateway_pagamento as GatewayId) || "onetimepay",
      gateway_id: pedido.gateway_id,
    });

    if (r) {
      if (r.statusInterno !== pedido.status) {
        const updates: Record<string, unknown> = {
          status: r.statusInterno,
          gateway_status: r.gatewayStatus,
          gateway_id: r.transactionId ?? pedido.gateway_id,
        };
        // Se acabou de virar pago e ainda nao tinha paid_at, registra agora
        if (r.statusInterno === "pago" && !pedido.paid_at) {
          updates.paid_at = new Date().toISOString();
        }
        await sb.from("pedidos").update(updates).eq("id", pedido.id);
        // Aviso instantaneo pra outras abas (ex.: outro browser do cliente).
        await broadcastStatusPedido(sb, numero, {
          status: r.statusInterno,
          paid_at: (updates.paid_at as string | undefined) ?? pedido.paid_at,
          gateway_status: r.gatewayStatus,
        });
        return json({
          status: r.statusInterno,
          gatewayStatus: r.gatewayStatus,
          paidAt: updates.paid_at ?? pedido.paid_at,
        });
      }
      return json({
        status: pedido.status,
        gatewayStatus: r.gatewayStatus,
        paidAt: pedido.paid_at,
      });
    }
  } catch (e) {
    console.error("[status] consulta gateway falhou", e);
  }

  return json({
    status: pedido.status,
    gatewayStatus: pedido.gateway_status,
    paidAt: pedido.paid_at,
  });
}
