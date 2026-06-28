"use server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { criarCobrancaPix, obterGatewayAtivo } from "@/lib/pagamento/gateway";
import {
  CUPOM_UPSELL,
  aplicarPrecoLiquidoNosItens,
  calcularDescontoUpsell,
  validarSubtotalUpsell,
} from "@/lib/cupom-upsell";
import { pedidoStatusEhPosPagamento } from "@/lib/pedido-status";

export type ItemUpsellInput = {
  produtoId: string;
  slug: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  imagem?: string | null;
};

export type AtribuicaoUpsellInput = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  adgroup?: string | null;
  keyword?: string | null;
  searchterm?: string | null;
  matchtype?: string | null;
  device?: string | null;
  creative?: string | null;
  gclid?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  firstVisitAt?: string | null;
};

export type CriarPedidoUpsellInput = {
  pedidoRefNumero: string;
  itens: ItemUpsellInput[];
  observacoes?: string;
  /** Atribuição capturada no front (first-click). */
  atribuicao?: AtribuicaoUpsellInput;
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
      "id, numero, status, cliente_nome, cliente_telefone, cliente_cpf, endereco, criado_em, paid_at, traffic_source, traffic_medium, traffic_campaign, traffic_adgroup, traffic_keyword, traffic_searchterm, traffic_matchtype, traffic_device, traffic_creative, traffic_gclid, traffic_landing_page, traffic_referrer, first_visit_at",
    )
    .eq("numero", input.pedidoRefNumero)
    .maybeSingle();

  if (!ref) {
    return { ok: false, erro: "Pedido de referencia nao encontrado" };
  }
  // Aceita qualquer status pos-pagamento (pago, em_separacao, em_entrega,
  // concluido). Antes so aceitava pago/concluido — se o admin movia o pedido
  // no funil, o cupom quebrava com "nao esta pago".
  if (!pedidoStatusEhPosPagamento(ref.status as string)) {
    return { ok: false, erro: "Pedido de referencia nao esta pago" };
  }
  // Validade do cupom: 24h a partir do PAGAMENTO (paid_at). Medir por
  // `criado_em` estava ERRADO — um pedido criado ha >24h mas pago agora caia
  // como "Cupom expirado" mesmo recem-resgatado. Se paid_at nao estiver
  // gravado (alguns gateways nao mandam a data no webhook), NAO bloqueamos por
  // tempo: o status ja confirma que foi pago e o cliente ja tem o limite de
  // 24h no proprio aparelho (localStorage). Melhor liberar do que recusar
  // um comprador real por falta de timestamp.
  if (ref.paid_at) {
    const idadeMs = Date.now() - new Date(ref.paid_at as string).getTime();
    if (idadeMs > CUPOM_UPSELL.DURACAO_MS) {
      return { ok: false, erro: "Cupom expirado (mais de 24h)" };
    }
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

  const itensLiquido = aplicarPrecoLiquidoNosItens(
    input.itens.map((i) => ({ ...i })),
    subtotal,
    total,
  );

  const numero = gerarNumero();
  const gatewayAtivo = await obterGatewayAtivo();
  const observacoesFinais = [
    `[UPSELL do pedido ${ref.numero} • cupom ${CUPOM_UPSELL.CODIGO} • ${CUPOM_UPSELL.DESCONTO_PERCENT}% OFF]`,
    input.observacoes?.trim() ? input.observacoes.trim() : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Para o upsell, herdamos a atribuição do pedido original sempre que possível —
  // o segundo pedido é só um aceite de cupom dentro da mesma jornada de compra.
  // Mas se o front mandou algo (ex: usuário voltou pelo histórico já com UTMs novas)
  // e o pedido referência não tinha atribuição, usamos o que o front mandou.
  const refTeve = Boolean(
    ref.traffic_source || ref.traffic_medium || ref.traffic_campaign || ref.traffic_gclid,
  );
  const atrib = input.atribuicao ?? {};
  const corta = (s: string | null | undefined, n = 255) =>
    typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null;
  const escolher = <T extends string | null | undefined>(refVal: T, frontVal: T): string | null => {
    if (refTeve) return (refVal as string | null) ?? null;
    return corta(frontVal as string | null);
  };
  const firstVisit = (() => {
    if (refTeve && ref.first_visit_at) return ref.first_visit_at as string;
    if (atrib.firstVisitAt) {
      const d = new Date(atrib.firstVisitAt);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  })();
  const agora = new Date().toISOString();

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
      // Atribuição: prioriza o pedido referência (mesma jornada)
      traffic_source: escolher(ref.traffic_source as string | null, atrib.source),
      traffic_medium: escolher(ref.traffic_medium as string | null, atrib.medium),
      traffic_campaign: escolher(ref.traffic_campaign as string | null, atrib.campaign),
      traffic_adgroup: escolher(ref.traffic_adgroup as string | null, atrib.adgroup),
      traffic_keyword: escolher(ref.traffic_keyword as string | null, atrib.keyword),
      traffic_searchterm: escolher(ref.traffic_searchterm as string | null, atrib.searchterm),
      traffic_matchtype: escolher(ref.traffic_matchtype as string | null, atrib.matchtype),
      traffic_device: escolher(ref.traffic_device as string | null, atrib.device),
      traffic_creative: escolher(ref.traffic_creative as string | null, atrib.creative),
      traffic_gclid: escolher(ref.traffic_gclid as string | null, atrib.gclid),
      traffic_landing_page: escolher(ref.traffic_landing_page as string | null, atrib.landingPage),
      traffic_referrer: escolher(ref.traffic_referrer as string | null, atrib.referrer),
      first_visit_at: firstVisit,
      conversion_at: agora,
    })
    .select("id, numero")
    .single();

  if (errPedido || !pedido) {
    console.error("[upsell] insert pedido", errPedido);
    return { ok: false, erro: errPedido?.message ?? "Erro ao registrar pedido" };
  }

  const { error: errItens } = await sb.from("itens_pedido").insert(
    itensLiquido.map((i) => ({
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

  // === Cria PIX com failover automatico entre gateways ===
  // Igual ao checkout principal: tenta o ativo primeiro, depois cai pros
  // outros (MarchaBB -> OneTimePay -> CenturionPay). callbackUrl eh resolvida
  // internamente pra cada gateway que a fila tentar.
  try {
    const enderecoRef = ref.endereco as Record<string, string> | null;

    // Itens já com preço proporcional ao total líquido — soma das linhas = `total`
    // e bate com `amount` (gateways que ignoram `amount` e somam items ficam corretos).
    const itensParaGateway = itensLiquido.map((i) => ({
      id: i.produtoId,
      nome: i.nome,
      quantidade: i.quantidade,
      precoUnitario: i.precoUnitario,
    }));

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
        itens: itensParaGateway,
        metadata: {
          pedidoNumero: pedido.numero,
          provider: "ze-chegou-24h",
          upsell: true,
          pedidoRef: ref.numero,
          cupom: CUPOM_UPSELL.CODIGO,
          subtotal_sem_desconto: subtotal,
          desconto_reais: calc.desconto,
        },
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

    if (pix.gateway !== gatewayAtivo || pix.tentativas.length > 1) {
      await sb.from("eventos_pedido").insert({
        pedido_id: pedido.id,
        tipo: "gateway_failover",
        dados: {
          gateway_preferido: gatewayAtivo,
          gateway_usado: pix.gateway,
          tentativas: pix.tentativas,
          descricao: `Failover de ${gatewayAtivo} -> ${pix.gateway} (upsell)`,
        },
      });
    }

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
    console.error("[upsell] gerar PIX falhou em todos os gateways", e);
    await sb
      .from("pedidos")
      .update({ gateway_status: `ERRO_TODOS_GATEWAYS: ${erro.slice(0, 200)}` })
      .eq("id", pedido.id);
    await sb.from("eventos_pedido").insert({
      pedido_id: pedido.id,
      tipo: "gateway_falha_total",
      dados: {
        gateway_preferido: gatewayAtivo,
        erro: erro.slice(0, 500),
        descricao: `Todos os gateways falharam ao gerar PIX (upsell)`,
      },
    });
    return { ok: false, erro: `Falha ao gerar PIX: ${erro}` };
  }
}
