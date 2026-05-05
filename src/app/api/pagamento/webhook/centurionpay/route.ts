import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapearStatusPedido } from "@/lib/centurionpay";
import { broadcastStatusPedido } from "@/lib/realtime-pedido";
import { revalidateTag } from "next/cache";

// Webhook (postback) CenturionPay
//
// Doc: https://centurion.readme.io/docs/eventos-e-webhooks
//
// Como o formato do postback nao foi 100% documentado pra nos no momento da
// integracao, esse handler aceita as duas variacoes mais comuns:
//
//   1) Envelope:
//      { "event": "transaction.paid", "data": { id, status, externalRef, ... } }
//
//   2) Plano (objeto da transacao direto):
//      { id, status, externalRef, paymentMethod, paidAt, ... }

export const dynamic = "force-dynamic";

type Transacao = {
  id?: string | number;
  status?: string;
  paymentMethod?: string;
  externalRef?: string | null;
  paidAt?: string | null;
  amount?: number;
};

type WebhookBody = Transacao & {
  event?: string;
  type?: string;
  objectId?: string | number;
  data?: Transacao;
};

function extrairTransacao(p: WebhookBody): Transacao {
  // Prioriza data (envelope), senao usa o proprio body (plano)
  if (p.data && typeof p.data === "object") return p.data;
  return p;
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseAdmin();

  let payload: WebhookBody;
  let raw: string;
  try {
    raw = await req.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("[webhook/centurionpay] body invalido", e);
    return NextResponse.json({ ok: false, erro: "body invalido" }, { status: 400 });
  }

  const t = extrairTransacao(payload);
  const tipo = payload.event ?? payload.type ?? "transaction";
  const identifier = t.externalRef ?? null;
  const transactionId = t.id != null ? String(t.id) : null;
  const statusCru = (t.status ?? "").toLowerCase();
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

  // Fallback: se nao achou por externalRef, tenta achar pelo gateway_id (transactionId)
  if (!pedidoId && transactionId) {
    const { data: ped } = await sb
      .from("pedidos")
      .select("id, status")
      .eq("gateway_id", transactionId)
      .eq("gateway_pagamento", "centurionpay")
      .maybeSingle();
    pedidoId = ped?.id ?? null;
  }

  await sb.from("webhook_eventos").insert({
    fonte: "centurionpay",
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
    gateway_status: t.status ?? evento,
    webhook_payload: payload as unknown as Record<string, unknown>,
  };
  if (transactionId) updates.gateway_id = transactionId;
  if (isPago) {
    updates.status = "pago";
    if (t.paidAt) updates.paid_at = t.paidAt;
  } else if (novoStatusInterno && !ehTravado) {
    updates.status = novoStatusInterno;
  }

  const { error: errUpd } = await sb.from("pedidos").update(updates).eq("id", pedidoId);
  if (errUpd) {
    console.error("[webhook/centurionpay] update pedido falhou", errUpd);
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
      status: t.status,
      transactionId,
      descricao: isPago
        ? "Pagamento confirmado via PIX (CenturionPay)"
        : `Webhook CenturionPay ${evento}`,
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
  return NextResponse.json({ ok: true, webhook: "centurionpay", info: "use POST" });
}
