import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapearStatusPedido } from "@/lib/marchabb";
import { revalidateTag } from "next/cache";

// Webhook (postback) MarchaBB
//
// Doc: https://app.marchabb.com/docs/intro/postbacks-format
//
// Formato:
//   {
//     "type": "transaction",
//     "url": "...",
//     "objectId": "123456",
//     "data": {
//       "id": 123456,
//       "amount": 750,
//       "paymentMethod": "pix",
//       "status": "paid" | "waiting_payment" | "approved" | "refunded" | "cancelled" | ...,
//       "externalRef": "ZCXXXX",     <- nosso pedido.numero
//       "paidAt": "2025-04-29T10:00:00.000Z",
//       "customer": {...},
//       "pix": { qrcode, expirationDate, ... }
//     }
//   }

export const dynamic = "force-dynamic";

type WebhookBody = {
  type?: string;
  objectId?: string | number;
  data?: {
    id?: number | string;
    status?: string;
    paymentMethod?: string;
    externalRef?: string | null;
    paidAt?: string | null;
    amount?: number;
  };
};

export async function POST(req: NextRequest) {
  const sb = createSupabaseAdmin();

  let payload: WebhookBody;
  let raw: string;
  try {
    raw = await req.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("[webhook/marchabb] body invalido", e);
    return NextResponse.json({ ok: false, erro: "body invalido" }, { status: 400 });
  }

  const tipo = payload.type ?? "unknown";
  const data = payload.data ?? {};
  const identifier = data.externalRef ?? null;
  const transactionId = data.id != null ? String(data.id) : null;
  const statusCru = (data.status ?? "").toLowerCase();
  const evento = `${tipo}.${statusCru || "?"}`;

  let pedidoId: string | null = null;
  if (identifier) {
    const { data: ped } = await sb
      .from("pedidos")
      .select("id, status")
      .eq("numero", identifier)
      .maybeSingle();
    pedidoId = ped?.id ?? null;
  }

  await sb.from("webhook_eventos").insert({
    fonte: "marchabb",
    evento,
    identifier,
    transaction_id: transactionId,
    pedido_id: pedidoId,
    payload: payload as unknown as Record<string, unknown>,
    processado: false,
  });

  if (!pedidoId) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "pedido nao encontrado" });
  }

  const isPago = statusCru === "paid" || statusCru === "approved";
  const novoStatusInterno = statusCru ? mapearStatusPedido(statusCru) : null;

  // Nunca rebaixa pedidos que ja avancaram no funil (admin pode ter marcado pago).
  const { data: pedAtual } = await sb
    .from("pedidos")
    .select("status")
    .eq("id", pedidoId)
    .maybeSingle();
  const statusAtual = pedAtual?.status as string | undefined;
  const STATUS_TRAVADOS = ["pago", "em_separacao", "em_entrega", "concluido"];
  const ehTravado = statusAtual ? STATUS_TRAVADOS.includes(statusAtual) : false;

  const updates: Record<string, unknown> = {
    gateway_status: data.status ?? evento,
    webhook_payload: payload as unknown as Record<string, unknown>,
  };
  if (transactionId) updates.gateway_id = transactionId;
  if (isPago) {
    updates.status = "pago";
    if (data.paidAt) updates.paid_at = data.paidAt;
  } else if (novoStatusInterno && !ehTravado) {
    updates.status = novoStatusInterno;
  }

  const { error: errUpd } = await sb.from("pedidos").update(updates).eq("id", pedidoId);
  if (errUpd) {
    console.error("[webhook/marchabb] update pedido falhou", errUpd);
    await sb
      .from("webhook_eventos")
      .update({ erro: errUpd.message })
      .eq("pedido_id", pedidoId)
      .eq("transaction_id", transactionId ?? "")
      .eq("processado", false);
    return NextResponse.json({ ok: false, erro: "falha ao atualizar pedido" }, { status: 500 });
  }

  await sb.from("eventos_pedido").insert({
    pedido_id: pedidoId,
    tipo: isPago ? "pagamento_confirmado" : "webhook",
    dados: {
      evento,
      status: data.status,
      transactionId,
      descricao: isPago
        ? "Pagamento confirmado via PIX (MarchaBB)"
        : `Webhook MarchaBB ${evento}`,
    },
  });

  await sb
    .from("webhook_eventos")
    .update({ processado: true })
    .eq("pedido_id", pedidoId)
    .eq("transaction_id", transactionId ?? "")
    .eq("processado", false);

  revalidateTag("pedidos");

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, webhook: "marchabb", info: "use POST" });
}
