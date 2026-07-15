import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapearStatusPedido } from "@/lib/playpayments";
import { broadcastStatusPedido } from "@/lib/realtime-pedido";
import { revalidateTag } from "next/cache";

// =============================================================================
// Webhook Play Payments
//
// Doc oficial: https://app.playpayments.com.br/docs (secao Webhooks)
// A URL eh configurada no painel deles em Configuracoes -> Webhooks.
//
// Payload (flat):
//
//   {
//     "event": "transaction.paid",       // transaction.paid | .expired | .cancelled
//     "transaction_id": "txn_abc123",
//     "external_id": "pedido-1234",      // nosso pedido.numero
//     "amount": 150.00,                  // em reais
//     "status": "paid",                  // pending | paid | expired | cancelled
//     "paid_at": "2025-01-01T00:15:30Z",
//     "customer": { "name": "...", "email": "...", "document": "..." }
//   }
//
// Responder HTTP 200 confirma o recebimento (senao eles reenviam em
// 1min -> 5min -> 30min -> 2h -> 24h). Eventos de saque (withdrawal.*)
// sao ignorados.
// =============================================================================

export const dynamic = "force-dynamic";

type Normalizado = {
  evento: string;
  identifier: string | null;
  transactionId: string | null;
  statusCru: string;
  paidAt: string | null;
};

function pegar<T = unknown>(obj: Record<string, unknown>, ...chaves: string[]): T | undefined {
  for (const k of chaves) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

function normalizarPayload(payload: unknown): Normalizado {
  const p = (payload ?? {}) as Record<string, unknown>;

  // Payload eh flat, mas por robustez aceitamos wrapper {data: {...}}.
  const data = (p.data as Record<string, unknown> | undefined) ?? p;

  const evento = pegar<string>(p, "event", "type") ?? pegar<string>(data, "event") ?? "?";

  const identifier = pegar<string>(data, "external_id", "externalId") ?? null;

  const idRaw = pegar<string | number>(data, "transaction_id", "transactionId", "id");
  const transactionId = idRaw != null ? String(idRaw) : null;

  const statusCru = (pegar<string>(data, "status") ?? "").toString().toLowerCase();

  const paidAt = pegar<string>(data, "paid_at", "paidAt") ?? null;

  return { evento, identifier, transactionId, statusCru, paidAt };
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseAdmin();

  let payload: unknown;
  let raw: string;
  try {
    raw = await req.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("[webhook/playpayments] body invalido", e);
    return NextResponse.json({ ok: false, erro: "body invalido" }, { status: 400 });
  }

  const { evento, identifier, transactionId, statusCru, paidAt } = normalizarPayload(payload);

  // Eventos de saque nao tem relacao com pedidos — confirma e ignora.
  if (evento.startsWith("withdrawal.")) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "evento de saque" });
  }

  let pedidoId: string | null = null;
  if (identifier) {
    const { data: ped } = await sb
      .from("pedidos")
      .select("id, status")
      .eq("numero", identifier)
      .maybeSingle();
    pedidoId = ped?.id ?? null;
  }
  // Se vier so o transaction_id (sem external_id), tenta achar por gateway_id
  if (!pedidoId && transactionId) {
    const { data: ped } = await sb
      .from("pedidos")
      .select("id, status")
      .eq("gateway_id", transactionId)
      .maybeSingle();
    pedidoId = ped?.id ?? null;
  }

  await sb.from("webhook_eventos").insert({
    fonte: "playpayments",
    evento,
    identifier,
    transaction_id: transactionId,
    pedido_id: pedidoId,
    payload: payload as Record<string, unknown>,
    processado: false,
  });

  if (!pedidoId) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "pedido nao encontrado" });
  }

  const isPago = statusCru === "paid" || evento === "transaction.paid";
  const novoStatusInterno = statusCru ? mapearStatusPedido(statusCru) : null;

  // Nao rebaixa pedidos que ja avancaram no funil.
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
    webhook_payload: payload as Record<string, unknown>,
  };
  if (transactionId) updates.gateway_id = transactionId;
  if (isPago) {
    updates.status = "pago";
    if (paidAt) updates.paid_at = paidAt;
  } else if (novoStatusInterno && !ehTravado) {
    updates.status = novoStatusInterno;
  }

  const { error: errUpd } = await sb.from("pedidos").update(updates).eq("id", pedidoId);
  if (errUpd) {
    console.error("[webhook/playpayments] update pedido falhou", errUpd);
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
        ? "Pagamento confirmado via PIX (Play Payments)"
        : `Webhook Play Payments ${evento}`,
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
  return NextResponse.json({ ok: true, webhook: "playpayments", info: "use POST" });
}
