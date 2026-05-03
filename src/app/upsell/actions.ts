"use server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { criarCobrancaPix, obterGatewayAtivo } from "@/lib/pagamento/gateway";
import {
  CUPOM_UPSELL,
  calcularDescontoUpsell,
  validarSubtotalUpsell,
} from "@/lib/cupom-upsell";

export type ItemUpsellInput = {
  produtoId: string;
  slug: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  imagem?: string | null;
};

export type CriarPedidoUpsellInput = {
  pedidoRefNumero: string;
  itens: ItemUpsellInput[];
  observacoes?: string;
};

export type CriarPedidoUpsellResultado =
  | {
      ok: true;
      numero: string;
      id: string;
      pix?: { code: string; image?: string; base64?: string; transactionId: string };
    }
  | { ok: false; erro: string };

function gerarNumero() {
  return (
    "ZU" +
    Date.now().toString(36).toUpperCase() +
    Math.floor(Math.random() * 1000).toString(36).toUpperCase()
  );
}

function emailFallback(nome: string, telefone: string) {
  const slug =
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/(^\.|\.$)/g, "")
      .slice(0, 30) || "cliente";
  const ddd = telefone.replace(/\D/g, "").slice(0, 11) || "00000000000";
  return `${slug}.${ddd}@gmail.com`;
}

export async function criarPedidoUpsell(
  input: CriarPedidoUpsellInput,
): Promise<CriarPedidoUpsellResultado> {
  if (!input.pedidoRefNumero?.trim()) {
    return { ok: false, erro: "Pedido de referencia ausente" };
  }
  if (!input.itens?.length) {
    return { ok: false, erro: "Carrinho vazio" };
  }

  const sb = createSupabaseAdmin();

  // Busca o pedido referência (do qual reusamos cliente/endereço).
  // Ele precisa estar PAGO pra liberar o upsell, e ter sido criado nas
  // ultimas 24h (defesa em profundidade — o front ja tem o limite de 5min).
  const { data: ref } = await sb
    .from("pedidos")
    .select(
      "id, numero, status, cliente_nome, cliente_telefone, cliente_cpf, endereco, criado_em, paid_at",
    )
    .eq("numero", input.pedidoRefNumero)
    .maybeSingle();

  if (!ref) {
    return { ok: false, erro: "Pedido de referencia nao encontrado" };
  }
  if (ref.status !== "pago" && ref.status !== "concluido") {
    return { ok: false, erro: "Pedido de referencia nao esta pago" };
  }
  const idadeMs = Date.now() - new Date((ref.paid_at ?? ref.criado_em) as string).getTime();
  if (idadeMs > 24 * 60 * 60 * 1000) {
    return { ok: false, erro: "Cupom expirado (mais de 24h)" };
  }

  // Subtotal do upsell (sem desconto)
  const subtotal = Math.round(
    input.itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0) * 100,
  ) / 100;

  const validacao = validarSubtotalUpsell(subtotal);
  if (!validacao.ok) {
    return { ok: false, erro: validacao.motivo };
  }

  const calc = calcularDescontoUpsell(subtotal);
  const total = calc.total;

  const numero = gerarNumero();
  const gatewayAtivo = await obterGatewayAtivo();
  const observacoesFinais = [
    `[UPSELL do pedido ${ref.numero} • cupom ${CUPOM_UPSELL.CODIGO} • ${CUPOM_UPSELL.DESCONTO_PERCENT}% OFF]`,
    input.observacoes?.trim() ? input.observacoes.trim() : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { data: pedido, error: errPedido } = await sb
    .from("pedidos")
    .insert({
      numero,
      status: "aguardando_pagamento",
      forma_pagamento: "pix",
      gateway_pagamento: gatewayAtivo,
      cliente_nome: ref.cliente_nome as string,
      cliente_telefone: ref.cliente_telefone as string,
      cliente_cpf: (ref.cliente_cpf as string | null) ?? null,
      endereco: ref.endereco as object,
      subtotal,
      taxa_entrega: 0,
      total,
      cupom_codigo: CUPOM_UPSELL.CODIGO,
      cupom_desconto: calc.desconto,
      pedido_ref: ref.numero as string,
      observacoes: observacoesFinais || null,
    })
    .select("id, numero")
    .single();

  if (errPedido || !pedido) {
    console.error("[upsell] insert pedido", errPedido);
    return { ok: false, erro: errPedido?.message ?? "Erro ao registrar pedido" };
  }

  const { error: errItens } = await sb.from("itens_pedido").insert(
    input.itens.map((i) => ({
      pedido_id: pedido.id,
      produto_id: i.produtoId,
      produto_slug: i.slug,
      produto_nome: i.nome,
      quantidade: i.quantidade,
      preco_unitario: i.precoUnitario,
      imagem: i.imagem ?? null,
    })),
  );
  if (errItens) {
    console.error("[upsell] insert itens", errItens);
    await sb.from("pedidos").delete().eq("id", pedido.id);
    return { ok: false, erro: "Erro ao salvar itens do pedido" };
  }

  // === Cria PIX no gateway ativo ===
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const ehLocal = /^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.)/i.test(siteUrl);
    const baseSite = siteUrl.replace(/\/$/, "");
    const callbackUrl = ehLocal
      ? undefined
      : gatewayAtivo === "marchabb"
        ? `${baseSite}/api/pagamento/webhook/marchabb`
        : gatewayAtivo === "centurionpay"
          ? `${baseSite}/api/pagamento/webhook/centurionpay`
          : `${baseSite}/api/pagamento/webhook`;

    const enderecoRef = ref.endereco as Record<string, string> | null;

    const pix = await criarCobrancaPix(
      {
        identifier: pedido.numero,
        amount: total,
        client: {
          name: ref.cliente_nome as string,
          email: emailFallback(
            ref.cliente_nome as string,
            ref.cliente_telefone as string,
          ),
          phone: ref.cliente_telefone as string,
          document: ((ref.cliente_cpf as string | null) ?? "").replace(/\D/g, ""),
        },
        endereco: {
          cep: enderecoRef?.cep ?? "",
          street: enderecoRef?.street ?? "",
          number: enderecoRef?.number ?? "",
          complement: enderecoRef?.complement ?? "",
          neighborhood: enderecoRef?.neighborhood ?? "",
          city: enderecoRef?.city ?? "",
          state: enderecoRef?.state ?? "",
        },
        itens: input.itens.map((i) => ({
          id: i.produtoId,
          nome: i.nome,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario,
        })),
        metadata: {
          pedidoNumero: pedido.numero,
          provider: "ze-chegou-24h",
          upsell: true,
          pedidoRef: ref.numero,
          cupom: CUPOM_UPSELL.CODIGO,
        },
        callbackUrl,
      },
      gatewayAtivo,
    );

    await sb
      .from("pedidos")
      .update({
        gateway_id: pix.transactionId,
        gateway_status: pix.gatewayStatus,
        gateway_pagamento: pix.gateway,
        pix_qr_code: pix.pix.code,
        pix_qr_image: pix.pix.base64 ?? pix.pix.image ?? null,
        order_url: pix.orderUrl,
        receipt_url: pix.receiptUrl,
      })
      .eq("id", pedido.id);

    return {
      ok: true,
      numero: pedido.numero as string,
      id: pedido.id as string,
      pix: {
        code: pix.pix.code,
        image: pix.pix.image ?? undefined,
        base64: pix.pix.base64 ?? undefined,
        transactionId: pix.transactionId,
      },
    };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Erro ao gerar PIX";
    console.error("[upsell] gerar PIX falhou", e);
    await sb
      .from("pedidos")
      .update({ gateway_status: `ERRO: ${erro.slice(0, 200)}` })
      .eq("id", pedido.id);
    return { ok: false, erro: `Falha ao gerar PIX: ${erro}` };
  }
}
