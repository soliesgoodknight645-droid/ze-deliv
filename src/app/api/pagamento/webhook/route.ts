import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { eventoEhPago, mapearStatusPedido, statusEhPago } from "@/lib/onetimepay";
import { broadcastStatusPedido } from "@/lib/realtime-pedido";
import { revalidateTag } from "next/cache";

// Webhook OneTimePay
//
// Eventos relevantes (segundo a doc):
//   TRANSACTION_CREATED      cobranca criada
//   TRANSACTION_PAID         pagamento confirmado  <- principal
//   TRANSACTION_CANCELED     cancelado
//   TRANSACTION_REFUNDED     estornado
//   TRANSACTION_CHARGEBACK   chargeback
//   TRANSFER_CREATED         saque criado
//
// Body tipico:
//   {
//     event: "TRANSACTION_PAID",
//     transaction: {
//       id: "clxxx...",
//       identifier: "ZCXXX...",   <- nosso numero do pedido
//       status: "COMPLETED",
//       amount: 19.90,
//       paymentMethod: "PIX",
//       payedAt: "2026-04-27T20:30:00.000Z",
//       client: {...}
//     }
//   }

export const dynamic = "force-dynamic";

type WebhookBody = {
  event?: string;
  type?: string;
  transaction?: {
    id?: string;
    identifier?: string;
    status?: string;
    subStatus?: string;
    amount?: number;
    paymentMethod?: string;
    payedAt?: string | null;
    paidAt?: string | null;
  };
  // formato alternativo (alguns gateways mandam flat)
  identifier?: string;
  transactionId?: string;
  status?: string;
  subStatus?: string;
};

export async function POST(req: NextRequest) {
  const sb = createSupabaseAdmin();

  let payload: WebhookBody;
  let raw: string;
  try {
    raw = await req.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("[webhook] body invalido", e);
    return NextResponse.json({ ok: false, erro: "body invalido" }, { status: 400 });
  }

  const evento = payload.event || payload.type || "UNKNOWN";
  const tx = payload.transaction || {
    id: payload.transactionId,
    identifier: payload.identifier,
    status: payload.status,
    subStatus: payload.subStatus,
  };
  const identifier = tx.identifier ?? null;
  const transactionId = tx.id ?? null;
  // Algumas adquirentes da OneTimePay devolvem o status real em `subStatus`,
  // deixando o `status` em algo intermediario (tipo "PROCESSING"). Olhamos os
  // dois pra detectar pagamento.
  const statusBruto = tx.status ?? "";
  const subStatusBruto = tx.subStatus ?? "";

  // Auditoria — guarda o payload bruto sempre (mesmo se nao achar pedido)
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
    fonte: "onetimepay",
    evento,
    identifier,
    transaction_id: transactionId,
    pedido_id: pedidoId,
    payload: payload as unknown as Record<string, unknown>,
    processado: false,
  });

  // Sem pedido pra associar — responde 200 pra nao ficar reentregando
  if (!pedidoId) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "pedido nao encontrado" });
  }

  // Mapeia o status considerando status principal e subStatus (algumas
  // adquirentes nova-OneTimePay enviam o status real em `subStatus`).
  const novoStatusInterno = statusBruto
    ? mapearStatusPedido(statusBruto)
    : subStatusBruto
      ? mapearStatusPedido(subStatusBruto)
      : null;
  const isPago =
    eventoEhPago(evento) ||
    statusEhPago(statusBruto) ||
    statusEhPago(subStatusBruto);

  // Re-le o pedido pra saber o status atual e nunca rebaixar pedidos que ja
  // avancaram (admin marcou pago manualmente, ja esta em separacao etc).
  const { data: pedAtual } = await sb
    .from("pedidos")
    .select("status")
    .eq("id", pedidoId)
    .maybeSingle();
  const statusAtual = pedAtual?.status as string | undefined;
  const STATUS_TRAVADOS = ["pago", "em_separacao", "em_entrega", "concluido"];
  const ehTravado = statusAtual ? STATUS_TRAVADOS.includes(statusAtual) : false;

  const updates: Record<string, unknown> = {
    gateway_status: statusBruto || subStatusBruto || evento,
    webhook_payload: payload as unknown as Record<string, unknown>,
  };
  if (transactionId) updates.gateway_id = transactionId;
  if (isPago) {
    updates.status = "pago";
    // Marca o horario do pagamento (usado pro cronometro de entrega).
    // Preferimos o timestamp que o gateway mandou; se nao tiver, usa agora.
    // Algumas adquirentes mandam `paidAt` em vez de `payedAt`.
    updates.paid_at = tx.payedAt ?? tx.paidAt ?? new Date().toISOString();
  } else if (novoStatusInterno && !ehTravado) {
    // So aplica novo status se o pedido ainda nao avancou. Evita um webhook
    // de "pending" voltar a status de pedido que ja foi pago/separado.
    updates.status = novoStatusInterno;
  }

  console.log(
    `[webhook] pedido=${identifier} evento=${evento} status=${statusBruto} subStatus=${subStatusBruto} -> isPago=${isPago}`,
  );

  const { error: errUpd } = await sb.from("pedidos").update(updates).eq("id", pedidoId);
  if (errUpd) {
    console.error("[webhook] update pedido falhou", errUpd);
    await sb
      .from("webhook_eventos")
      .update({ erro: errUpd.message })
      .eq("pedido_id", pedidoId)
      .eq("transaction_id", transactionId ?? "")
      .eq("processado", false);
    return NextResponse.json({ ok: false, erro: "falha ao atualizar pedido" }, { status: 500 });
  }

  // log na timeline do pedido
  await sb.from("eventos_pedido").insert({
    pedido_id: pedidoId,
    tipo: isPago ? "pagamento_confirmado" : "webhook",
    dados: {
      evento,
      status: statusBruto || null,
      subStatus: subStatusBruto || null,
      transactionId,
      descricao: isPago
        ? `Pagamento confirmado via PIX (OneTimePay)`
        : `Webhook ${evento} (status ${statusBruto || subStatusBruto || "?"})`,
    },
  });

  await sb
    .from("webhook_eventos")
    .update({ processado: true })
    .eq("pedido_id", pedidoId)
    .eq("transaction_id", transactionId ?? "")
    .eq("processado", false);

  revalidateTag("pedidos");

  // Aviso instantaneo pra a tela do cliente.
  if (identifier && updates.status) {
    await broadcastStatusPedido(sb, identifier, {
      status: updates.status as string,
      paid_at: (updates.paid_at as string | undefined) ?? null,
      gateway_status: (updates.gateway_status as string | undefined) ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, webhook: "onetimepay", info: "use POST" });
}
