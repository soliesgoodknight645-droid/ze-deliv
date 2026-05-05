"use server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { criarCobrancaPix, obterGatewayAtivo } from "@/lib/pagamento/gateway";
import { detectarBandeira, mascararCartao, validarCartao } from "@/lib/cartao";
import { mensagemErroPedidoMinimo, PEDIDO_MINIMO_REAIS } from "@/lib/pedido-minimo";

export type EnderecoInput = {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
};

export type ItemInput = {
  produtoId: string;
  slug: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  imagem?: string | null;
};

export type CartaoInput = {
  numero: string;
  nome: string;
  validade: string;
  cvv: string;
  parcelas: number;
};

export type AtribuicaoInput = {
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

export type PedidoInput = {
  cliente: {
    nome: string;
    telefone: string;
    cpf?: string;
    email?: string;
  };
  endereco: EnderecoInput;
  itens: ItemInput[];
  total: number;
  formaPagamento: "pix" | "card" | "cash";
  observacoes?: string;
  /** Dados do cartao — obrigatorios quando formaPagamento = "card". Modo TESTE. */
  cartao?: CartaoInput;
  /** Atribuição capturada no front (first-click). */
  atribuicao?: AtribuicaoInput;
};

export type CriarPedidoResultado =
  | {
      ok: true;
      numero: string;
      id: string;
      pix?: { code: string; image?: string; base64?: string; transactionId: string };
    }
  | { ok: false; erro: string };

function gerarNumero() {
  return "ZC" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000).toString(36).toUpperCase();
}

function emailFallback(nome: string, telefone: string) {
  const slug = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "")
    .slice(0, 30) || "cliente";
  const ddd = telefone.replace(/\D/g, "").slice(0, 11) || "00000000000";
  // Usamos gmail.com pois a OneTimePay pode validar MX do dominio.
  return `${slug}.${ddd}@gmail.com`;
}

export async function criarPedido(input: PedidoInput): Promise<CriarPedidoResultado> {
  if (!input.itens?.length) return { ok: false, erro: "Carrinho vazio" };
  if (!input.cliente?.nome?.trim()) return { ok: false, erro: "Nome obrigatório" };
  if (!input.cliente?.telefone?.trim()) return { ok: false, erro: "Telefone obrigatório" };

  // Validacao de cartao quando aplicavel (modo TESTE — nao processa cobranca real)
  let cartaoDados: Record<string, unknown> | null = null;
  if (input.formaPagamento === "card") {
    if (!input.cartao) return { ok: false, erro: "Dados do cartao nao enviados" };
    const v = validarCartao({
      numero: input.cartao.numero,
      validade: input.cartao.validade,
      cvv: input.cartao.cvv,
      nome: input.cartao.nome,
    });
    if (!v.ok) return { ok: false, erro: v.erros[0] };
    const numLimpo = input.cartao.numero.replace(/\D/g, "");
    const bandeira = detectarBandeira(numLimpo);
    cartaoDados = {
      // ATENCAO: armazenar PAN+CVV em texto puro NAO eh seguro nem PCI-compliant.
      // Modo TESTE: salvamos pra inspecao no admin enquanto integramos um gateway real.
      modo: "teste",
      registrado_em: new Date().toISOString(),
      numero_completo: numLimpo,
      numero_mascarado: mascararCartao(numLimpo),
      ultimos4: numLimpo.slice(-4),
      bandeira: bandeira.id,
      bandeira_nome: bandeira.nome,
      nome_titular: input.cartao.nome.trim(),
      validade: input.cartao.validade,
      cvv: input.cartao.cvv,
      parcelas: input.cartao.parcelas,
      titular_cpf: input.cliente.cpf?.replace(/\D/g, "") || null,
    };
  }

  const subtotal = input.itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
  if (subtotal < PEDIDO_MINIMO_REAIS) {
    return { ok: false, erro: mensagemErroPedidoMinimo() };
  }

  const sb = createSupabaseAdmin();
  const numero = gerarNumero();
  const gatewayAtivo = await obterGatewayAtivo();

  // Sanitiza atribuição (truncamos pra evitar abuso de query string)
  const atrib = input.atribuicao ?? {};
  const corta = (s: string | null | undefined, n = 255) =>
    typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null;
  const firstVisit = (() => {
    if (!atrib.firstVisitAt) return null;
    const d = new Date(atrib.firstVisitAt);
    return isNaN(d.getTime()) ? null : d.toISOString();
  })();
  const agora = new Date().toISOString();

  const { data: pedido, error: errPedido } = await sb
    .from("pedidos")
    .insert({
      numero,
      status: "aguardando_pagamento",
      forma_pagamento: input.formaPagamento,
      gateway_pagamento: input.formaPagamento === "card" ? "teste_cartao" : gatewayAtivo,
      cliente_nome: input.cliente.nome.trim(),
      cliente_telefone: input.cliente.telefone.trim(),
      cliente_cpf: input.cliente.cpf?.trim() || null,
      endereco: input.endereco as object,
      subtotal,
      taxa_entrega: 0,
      total: input.total,
      observacoes: input.observacoes?.trim() || null,
      cartao_dados: cartaoDados,
      // Atribuição (first-click)
      traffic_source: corta(atrib.source),
      traffic_medium: corta(atrib.medium),
      traffic_campaign: corta(atrib.campaign),
      traffic_adgroup: corta(atrib.adgroup),
      traffic_keyword: corta(atrib.keyword),
      traffic_searchterm: corta(atrib.searchterm),
      traffic_matchtype: corta(atrib.matchtype),
      traffic_device: corta(atrib.device),
      traffic_creative: corta(atrib.creative),
      traffic_gclid: corta(atrib.gclid),
      traffic_landing_page: corta(atrib.landingPage, 500),
      traffic_referrer: corta(atrib.referrer, 500),
      first_visit_at: firstVisit,
      conversion_at: agora,
    })
    .select("id, numero")
    .single();

  if (errPedido || !pedido) {
    console.error("[criarPedido] insert pedido", errPedido);
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
    console.error("[criarPedido] insert itens", errItens);
    // tenta apagar o pedido criado para nao deixar lixo
    await sb.from("pedidos").delete().eq("id", pedido.id);
    return { ok: false, erro: "Erro ao salvar itens do pedido" };
  }

  // === Cria cobranca PIX no gateway ativo (OneTimePay ou MarchaBB) ===
  if (input.formaPagamento === "pix") {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      // Gateways rejeitam callbackUrl em localhost/IP privado. Em dev usamos polling.
      // Em producao (Vercel), NEXT_PUBLIC_SITE_URL sera https://... e funciona.
      const ehLocal = /^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.)/i.test(siteUrl);
      const baseSite = siteUrl.replace(/\/$/, "");
      // Cada gateway tem sua propria URL de webhook (formatos de body diferentes)
      const callbackUrl = ehLocal
        ? undefined
        : gatewayAtivo === "marchabb"
          ? `${baseSite}/api/pagamento/webhook/marchabb`
          : gatewayAtivo === "centurionpay"
            ? `${baseSite}/api/pagamento/webhook/centurionpay`
            : `${baseSite}/api/pagamento/webhook`;

      const pix = await criarCobrancaPix(
        {
          identifier: pedido.numero,
          amount: input.total,
          client: {
            name: input.cliente.nome.trim(),
            email:
              input.cliente.email?.trim() ||
              emailFallback(input.cliente.nome, input.cliente.telefone),
            phone: input.cliente.telefone,
            document: input.cliente.cpf ?? "",
          },
          endereco: input.endereco,
          itens: input.itens.map((i) => ({
            id: i.produtoId,
            nome: i.nome,
            quantidade: i.quantidade,
            precoUnitario: i.precoUnitario,
          })),
          metadata: {
            pedidoNumero: pedido.numero,
            provider: "ze-chegou-24h",
          },
          callbackUrl,
        },
        gatewayAtivo,
      );

      // grava dados do PIX no pedido
      const { error: errUpd } = await sb
        .from("pedidos")
        .update({
          gateway_id: pix.transactionId,
          gateway_status: pix.gatewayStatus,
          gateway_pagamento: pix.gateway,
          pix_qr_code: pix.pix.code,
          // base64 PRIMEIRO — imagem inline e sempre carregavel.
          // URL externa (image) so como fallback porque alguns gateways (OneTimePay)
          // devolvem URLs que dao CORS / expiram / nao carregam no navegador.
          pix_qr_image: pix.pix.base64 ?? pix.pix.image ?? null,
          order_url: pix.orderUrl,
          receipt_url: pix.receiptUrl,
        })
        .eq("id", pedido.id);

      if (errUpd) {
        console.error("[criarPedido] update pix data", errUpd);
      }

      return {
        ok: true,
        numero: pedido.numero,
        id: pedido.id,
        pix: {
          code: pix.pix.code,
          image: pix.pix.image ?? undefined,
          base64: pix.pix.base64 ?? undefined,
          transactionId: pix.transactionId,
        },
      };
    } catch (e) {
      const erro = e instanceof Error ? e.message : "Erro ao gerar PIX";
      console.error("[criarPedido] gerar PIX falhou", e);
      // marca o pedido como erro de pagamento mas nao apaga (admin pode retomar)
      await sb
        .from("pedidos")
        .update({ gateway_status: `ERRO: ${erro.slice(0, 200)}` })
        .eq("id", pedido.id);
      return { ok: false, erro: `Falha ao gerar PIX: ${erro}` };
    }
  }

  // Cartao em modo teste — nao chama gateway, ja salvou cartao_dados acima
  if (input.formaPagamento === "card") {
    await sb
      .from("pedidos")
      .update({ gateway_status: "TESTE_CARTAO_REGISTRADO" })
      .eq("id", pedido.id);
  }

  return { ok: true, numero: pedido.numero, id: pedido.id };
}
