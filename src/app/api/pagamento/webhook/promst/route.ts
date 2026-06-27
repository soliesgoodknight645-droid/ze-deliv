import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapearStatusPedido } from "@/lib/promst";
import { broadcastStatusPedido } from "@/lib/realtime-pedido";
import { revalidateTag } from "next/cache";

// Webhook (postback) Promst
//
// A doc oficial nao define postback — a confirmacao normalmente acontece via
// polling em /api/pagamento/status/[numero], que consulta /verify_payment.
//
// Mesmo assim deixamos o endpoint registrado: se a Promst comecar a mandar
// postback (ou se um proxy no meio retransmitir o resultado de pagamento),
// a gente ja absorve sem ter que mexer no checkout.
//
// Formato esperado (deduzido — confirmar quando a Promst publicar):
//   { payment_id?: string, txid?: string, status?: string, status_pagamento?: string,
//     valor?: number }

export const dynamic = "force-dynamic";

type WebhookBody = {
  payment_id?: string;
  txid?: string;
  status?: string;
  status_pagamento?: string;
  valor?: number;
};

export async function POST(req: NextRequest) {
  const sb = createSupabaseAdmin();

  let payload: WebhookBody;
  let raw: string;
  try {
    raw = await req.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("[webhook/promst] body invalido", e);
    return NextResponse.json({ ok: false, erro: "body invalido" }, { status: 400 });
  }

  const transactionId = payload.payment_id ?? payload.txid ?? null;
  const statusCru = (payload.status_pagamento ?? payload.status ?? "").toString();
  const evento = `promst.${statusCru || "?"}`;

  // Promst nao manda nosso pedido.numero — achamos pelo gateway_id (txid).
  let pedidoId: string | null = null;
  if (transactionId) {
    const { data: ped } = await sb
      .from("pedidos")
      .select("id, numero, status")
      .eq("gateway_id", transactionId)
      .eq("gateway_pagamento", "promst")
      .maybeSingle();
    pedidoId = ped?.id ?? null;
  }

  const identifier = await (async () => {
    if (!pedidoId) return null;
    const { data: ped } = await sb
      .from("pedidos")
      .select("numero")
      .eq("id", pedidoId)
      .maybeSingle();
    return (ped?.numero as string | null) ?? null;
  })();

  await sb.from("webhook_eventos").insert({
    fonte: "promst",
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

  const novoStatusInterno = statusCru ? mapearStatusPedido(statusCru) : null;
  const isPago = novoStatusInterno === "pago";

  // Nunca rebaixa pedidos que ja avancaram no funil.
  const { data: pedAtual } = await sb
    .from("pedidos")
    .select("status")
    .eq("id", pedidoId)
    .maybeSingle();
  const statusAtual = pedAtual?.status as string | undefined;
  const STATUS_TRAVADOS = ["pago", "em_separacao", "em_entrega", "concluido"];
  const ehTravado = statusAtual ? STATUS_TRAVADOS.includes(statusAtual) : false;

  const updates: Record<string, unknown> = {
    gateway_status: statusCru || evento,
    webhook_payload: payload as unknown as Record<string, unknown>,
  };
  if (isPago) {
    updates.status = "pago";
    updates.paid_at = new Date().toISOString();
  } else if (novoStatusInterno && !ehTravado) {
    updates.status = novoStatusInterno;
  }

  const { error: errUpd } = await sb.from("pedidos").update(updates).eq("id", pedidoId);
  if (errUpd) {
    console.error("[webhook/promst] update pedido falhou", errUpd);
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
      status: statusCru,
      transactionId,
      descricao: isPago
        ? "Pagamento confirmado via PIX (Promst)"
        : `Webhook Promst ${evento}`,
    },
  });

  await sb
    .from("webhook_eventos")
    .update({ processado: true })
    .eq("pedido_id", pedidoId)
    .eq("transaction_id", transactionId ?? "")
    .eq("processado", false);

  revalidateTag("pedidos");

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
  return NextResponse.json({ ok: true, webhook: "promst", info: "use POST" });
}
