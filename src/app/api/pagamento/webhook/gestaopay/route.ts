import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapearStatusPedido } from "@/lib/gestaopay";
import { broadcastStatusPedido } from "@/lib/realtime-pedido";
import { revalidateTag } from "next/cache";

// =============================================================================
// Webhook (postback) GestaoPay
//
// Doc oficial: https://gestaopay.readme.io/reference/formato-dos-webhooks
//
// Formato real (transacoes, campos PascalCase!):
//
//   {
//     "Id": "a24207e615224923bf4a68265d519fc6",
//     "CreatedAt": "05/11/2025 21:19:42",
//     "UpdatedAt": "2025-11-05T21:19:42.3648396",
//     "ExternalId": "27615041",
//     "E2E": "E18236120202604261530s8f7a6b5c4d3e2f1",
//     "PaidAt": "0001-01-01T00:00:00",
//     "Amount": 100,                      // Em reais
//     "Installments": 0,
//     "PaymentMethod": "pix",
//     "Status": "PENDING",                // PENDING/PAID/REFUNDED/REFUSED/...
//     "PostbackUrl": "https://..."
//   }
//
// Por seguranca, o normalizador tambem aceita o mesmo payload em
// camelCase/snake_case e os formatos "wrapper" comuns ({type,data}).
// =============================================================================

export const dynamic = "force-dynamic";

type Normalizado = {
  tipo: string;
  identifier: string | null;
  transactionId: string | null;
  statusCru: string;
  paidAt: string | null;
  amount: number | null;
};

function pegar<T = unknown>(obj: Record<string, unknown>, ...chaves: string[]): T | undefined {
  for (const k of chaves) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

function normalizarPayload(payload: unknown): Normalizado {
  const p = (payload ?? {}) as Record<string, unknown>;
  const tipo =
    pegar<string>(p, "type", "Type", "event", "Event", "eventType", "EventType") ?? "transaction";

  // Pode vir flat (GestaoPay) OU wrapped (alguns gateways usam {data: {...}}).
  const data =
    (p.data as Record<string, unknown> | undefined) ??
    (p.Data as Record<string, unknown> | undefined) ??
    (p.transaction as Record<string, unknown> | undefined) ??
    (p.Transaction as Record<string, unknown> | undefined) ??
    p;

  // ExternalId (GestaoPay) === nosso pedido.numero (vai como external_ref nos items)
  const identifier =
    pegar<string>(
      data,
      "ExternalId",
      "externalId",
      "external_id",
      "externalRef",
      "external_ref",
      "referenceId",
      "reference_id",
      "identifier",
    ) ?? null;

  const idRaw = pegar<string | number>(data, "Id", "id", "_id", "TransactionId", "transactionId");
  const transactionId = idRaw != null ? String(idRaw) : null;

  // GestaoPay manda status em UPPERCASE. Mantemos uppercase pra mapear depois.
  const statusCru = (pegar<string>(data, "Status", "status") ?? "").toString().toUpperCase();

  // PaidAt = "0001-01-01T00:00:00" significa "ainda nao pago" — ignoramos.
  const paidRaw = pegar<string>(data, "PaidAt", "paidAt", "paid_at", "approvedAt");
  const paidAt = paidRaw && !paidRaw.startsWith("0001-01-01") ? paidRaw : null;

  const amountRaw = pegar<number | string>(data, "Amount", "amount", "value");
  const amount = typeof amountRaw === "number" ? amountRaw : null;

  return { tipo, identifier, transactionId, statusCru, paidAt, amount };
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseAdmin();

  let payload: unknown;
  let raw: string;
  try {
    raw = await req.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("[webhook/gestaopay] body invalido", e);
    return NextResponse.json({ ok: false, erro: "body invalido" }, { status: 400 });
  }

  const { tipo, identifier, transactionId, statusCru, paidAt } = normalizarPayload(payload);
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
  // Se vier so o transactionId (sem externalRef), tenta achar por gateway_id
  if (!pedidoId && transactionId) {
    const { data: ped } = await sb
      .from("pedidos")
      .select("id, status")
      .eq("gateway_id", transactionId)
      .maybeSingle();
    pedidoId = ped?.id ?? null;
  }

  await sb.from("webhook_eventos").insert({
    fonte: "gestaopay",
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

  const isPago = statusCru === "PAID";
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
    console.error("[webhook/gestaopay] update pedido falhou", errUpd);
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
        ? "Pagamento confirmado via PIX (GestaoPay)"
        : `Webhook GestaoPay ${evento}`,
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
  return NextResponse.json({ ok: true, webhook: "gestaopay", info: "use POST" });
}
