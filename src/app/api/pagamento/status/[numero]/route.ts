import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { consultarStatusPedido, type GatewayId } from "@/lib/pagamento/gateway";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ erro: "pedido nao encontrado" }, { status: 404 });
  }

  if (pedido.status === "pago" || pedido.status === "concluido") {
    return NextResponse.json({
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
        return NextResponse.json({
          status: r.statusInterno,
          gatewayStatus: r.gatewayStatus,
          paidAt: updates.paid_at ?? pedido.paid_at,
        });
      }
      return NextResponse.json({
        status: pedido.status,
        gatewayStatus: r.gatewayStatus,
        paidAt: pedido.paid_at,
      });
    }
  } catch (e) {
    console.error("[status] consulta gateway falhou", e);
  }

  return NextResponse.json({
    status: pedido.status,
    gatewayStatus: pedido.gateway_status,
    paidAt: pedido.paid_at,
  });
}
