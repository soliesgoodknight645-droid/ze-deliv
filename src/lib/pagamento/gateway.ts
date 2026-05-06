import "server-only";

import * as otp from "@/lib/onetimepay";
import * as mbb from "@/lib/marchabb";
import * as cp from "@/lib/centurionpay";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { gerarQrCodeDataUrl } from "./qrcode";

// =====================================================================
// Camada de abstracao de gateway de pagamento PIX.
//
// O codigo do checkout/webhook/status NAO importa onetimepay/marchabb
// diretamente — passa por aqui. Isso deixa fácil:
//   - alternar gateway via toggle no admin (tabela app_config)
//   - manter os dois lado a lado sem mexer um no outro
//   - adicionar um terceiro gateway no futuro
// =====================================================================

export type GatewayId = "onetimepay" | "marchabb" | "centurionpay";

const GATEWAY_IDS: GatewayId[] = ["onetimepay", "marchabb", "centurionpay"];

export const GATEWAYS_DISPONIVEIS: { id: GatewayId; label: string; descricao: string }[] = [
  {
    id: "onetimepay",
    label: "OneTimePay",
    descricao: "Gateway PIX original (problema com chaves no momento)",
  },
  {
    id: "marchabb",
    label: "MarchaBB",
    descricao: "Gateway PIX alternativo — Basic Auth, valor em centavos",
  },
  {
    id: "centurionpay",
    label: "CenturionPay",
    descricao: "Gateway PIX/cartão — Basic Auth (secret:companyId), valor em centavos",
  },
];

const CHAVE_CONFIG = "gateway_pagamento_ativo";
const DEFAULT: GatewayId = "marchabb";

// Cache simples em memoria pra nao bater no banco a cada checkout (1 minuto)
let cache: { gateway: GatewayId; expira: number } | null = null;

/** Retorna o gateway ativo (lido do app_config no Supabase). Cacheado por 60s. */
export async function obterGatewayAtivo(): Promise<GatewayId> {
  const agora = Date.now();
  if (cache && cache.expira > agora) return cache.gateway;

  try {
    const sb = createSupabaseAdmin();
    const { data } = await sb
      .from("app_config")
      .select("valor")
      .eq("chave", CHAVE_CONFIG)
      .maybeSingle();

    const v = (data?.valor as string | undefined) ?? DEFAULT;
    const gateway: GatewayId = (GATEWAY_IDS as string[]).includes(v) ? (v as GatewayId) : DEFAULT;
    cache = { gateway, expira: agora + 60_000 };
    return gateway;
  } catch (e) {
    console.error("[gateway] falha ao ler app_config", e);
    return DEFAULT;
  }
}

/** Define o gateway ativo. Limpa o cache pra mudanca refletir imediatamente. */
export async function definirGatewayAtivo(gateway: GatewayId, atualizadoPor?: string) {
  const sb = createSupabaseAdmin();
  const { error } = await sb
    .from("app_config")
    .upsert(
      {
        chave: CHAVE_CONFIG,
        valor: gateway,
        atualizado_por: atualizadoPor ?? null,
      },
      { onConflict: "chave" },
    );
  if (error) throw new Error(`Falha ao salvar gateway: ${error.message}`);
  cache = null;
}

// =====================================================================
// Metodos de pagamento ativos (PIX, cartao, dinheiro)
// O admin pode habilitar/desabilitar cada um pelo painel.
// =====================================================================

export type MetodoPagamento = "pix" | "card" | "cash";

export type MetodosAtivos = {
  pix: boolean;
  card: boolean;
  cash: boolean;
};

const CHAVES_METODOS: Record<MetodoPagamento, string> = {
  pix: "metodo_pix_ativo",
  card: "metodo_cartao_ativo",
  cash: "metodo_dinheiro_ativo",
};

let cacheMetodos: { valor: MetodosAtivos; expira: number } | null = null;

export async function obterMetodosAtivos(): Promise<MetodosAtivos> {
  const agora = Date.now();
  if (cacheMetodos && cacheMetodos.expira > agora) return cacheMetodos.valor;

  try {
    const sb = createSupabaseAdmin();
    const { data } = await sb
      .from("app_config")
      .select("chave, valor")
      .in("chave", Object.values(CHAVES_METODOS));

    const mapa = new Map((data ?? []).map((r) => [r.chave as string, r.valor]));
    const lerBool = (chave: string, padrao: boolean): boolean => {
      if (!mapa.has(chave)) return padrao;
      const v = mapa.get(chave);
      return v === true || v === "true";
    };
    const valor: MetodosAtivos = {
      pix: lerBool(CHAVES_METODOS.pix, true),
      card: lerBool(CHAVES_METODOS.card, false),
      cash: lerBool(CHAVES_METODOS.cash, false),
    };
    cacheMetodos = { valor, expira: agora + 60_000 };
    return valor;
  } catch (e) {
    console.error("[gateway] falha ao ler metodos ativos", e);
    return { pix: true, card: false, cash: false };
  }
}

export async function definirMetodoAtivo(metodo: MetodoPagamento, ativo: boolean, atualizadoPor?: string) {
  const sb = createSupabaseAdmin();
  const { error } = await sb
    .from("app_config")
    .upsert(
      {
        chave: CHAVES_METODOS[metodo],
        valor: ativo,
        atualizado_por: atualizadoPor ?? null,
      },
      { onConflict: "chave" },
    );
  if (error) throw new Error(`Falha ao salvar metodo: ${error.message}`);
  cacheMetodos = null;
}

// =====================================================================
// API unificada (usada pelo checkout)
// =====================================================================

export type CriarPixUnificadoInput = {
  identifier: string;
  amount: number;
  client: { name: string; email: string; phone: string; document: string };
  endereco?: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  itens: Array<{ id: string; nome: string; quantidade: number; precoUnitario: number }>;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
};

export type CriarPixUnificadoResposta = {
  gateway: GatewayId;
  /** ID da transacao no gateway (usado pra consulta posterior) */
  transactionId: string;
  /** Status retornado pelo gateway (string crua) */
  gatewayStatus: string;
  pix: {
    code: string;
    image?: string | null;
    base64?: string | null;
  };
  /** URL de pagamento externo (quando o gateway expoe) */
  orderUrl?: string | null;
  /** URL do recibo (quando disponivel) */
  receiptUrl?: string | null;
};

/**
 * Cria uma cobranca PIX no gateway recebido.
 * Se gateway nao for passado, usa o ativo no momento.
 */
export async function criarCobrancaPix(
  input: CriarPixUnificadoInput,
  gatewayForcado?: GatewayId,
): Promise<CriarPixUnificadoResposta> {
  const gateway = gatewayForcado ?? (await obterGatewayAtivo());

  if (gateway === "onetimepay") {
    // OneTimePay: o PIX segue o campo `amount` do body. Enviar `amount` = subtotal
    // + `discount` em reais faz a API cobrar o subtotal quando ela ignora `discount`
    // (caso comum) — upsell ficava sem os 50%. Sempre enviar só o valor líquido.
    const r = await otp.criarCobrancaPix({
      identifier: input.identifier,
      amount: input.amount,
      client: input.client,
      products: input.itens.map((i) => ({
        id: i.id,
        name: i.nome,
        quantity: i.quantidade,
        price: i.precoUnitario,
        physical: true,
      })),
      metadata: input.metadata,
      callbackUrl: input.callbackUrl,
    });
    // SEMPRE garante um base64 inline (mais confiavel que a URL externa do OneTimePay,
    // que as vezes tem CORS/expira/bloqueia carregamento direto no <img>)
    let base64 = r.pix.base64 ?? null;
    if (!base64 && r.pix.code) {
      base64 = await gerarQrCodeDataUrl(r.pix.code);
    }
    return {
      gateway,
      transactionId: r.transactionId,
      gatewayStatus: r.status,
      pix: {
        code: r.pix.code,
        image: r.pix.image ?? null,
        base64,
      },
      orderUrl: r.order?.url ?? null,
      receiptUrl: r.order?.receiptUrl ?? null,
    };
  }

  if (gateway === "marchabb") {
    // MarchaBB — so manda o codigo de copia-e-cola, geramos o QR visual aqui
    const r = await mbb.criarCobrancaPix({
      identifier: input.identifier,
      amount: input.amount,
      client: input.client,
      endereco: input.endereco,
      items: input.itens.map((i) => ({
        title: i.nome,
        quantity: i.quantidade,
        price: i.precoUnitario,
        tangible: true,
        ref: i.id,
      })),
      metadata: input.metadata,
      postbackUrl: input.callbackUrl,
    });
    const qrBase64 = await gerarQrCodeDataUrl(r.pix.qrcode);
    return {
      gateway,
      transactionId: String(r.id),
      gatewayStatus: r.status,
      pix: {
        code: r.pix.qrcode,
        image: null,
        base64: qrBase64,
      },
      orderUrl: r.secureUrl ?? null,
      receiptUrl: r.pix.receiptUrl ?? null,
    };
  }

  // CenturionPay — mesma logica do MarchaBB (so qrcode em texto)
  const r = await cp.criarCobrancaPix({
    identifier: input.identifier,
    amount: input.amount,
    client: input.client,
    endereco: input.endereco,
    items: input.itens.map((i) => ({
      title: i.nome,
      quantity: i.quantidade,
      price: i.precoUnitario,
      tangible: true,
    })),
    metadata: input.metadata,
    postbackUrl: input.callbackUrl,
  });
  const qrBase64 = await gerarQrCodeDataUrl(r.pix.qrcode);
  return {
    gateway,
    transactionId: r.id,
    gatewayStatus: r.status,
    pix: {
      code: r.pix.qrcode,
      image: null,
      base64: qrBase64,
    },
    orderUrl: r.secureUrl ?? null,
    receiptUrl: r.pix.receiptUrl ?? null,
  };
}

// =====================================================================
// Consulta de status (usada pelo polling /api/pagamento/status/[numero])
// =====================================================================

export type ConsultaStatusResultado = {
  /** Status do gateway (paid, COMPLETED, waiting_payment, PENDING, etc.) */
  gatewayStatus: string;
  /** Status interno mapeado (pago, aguardando_pagamento, cancelado) */
  statusInterno: string;
  transactionId?: string;
};

/**
 * Consulta o status de um pedido no gateway que o processou.
 * Recebe o pedido (com numero + gateway_pagamento + gateway_id) e devolve
 * o status atualizado.
 */
export async function consultarStatusPedido(pedido: {
  numero: string;
  gateway_pagamento: GatewayId | string;
  gateway_id: string | null;
}): Promise<ConsultaStatusResultado | null> {
  const gateway = (pedido.gateway_pagamento as GatewayId) || "onetimepay";

  if (gateway === "onetimepay") {
    const r = await otp.consultarTransacaoPorIdentifier(pedido.numero);
    const item =
      r.data?.items?.[0] ||
      (r.transactionId
        ? { transactionId: r.transactionId, status: r.status ?? "", subStatus: r.subStatus }
        : null);
    if (!item?.status) return null;
    // Algumas adquirentes da OneTimePay devolvem o status real em `subStatus`,
    // deixando o `status` em algo intermediario. Se o subStatus indicar pago,
    // priorizamos ele.
    const statusEfetivo = otp.statusEhPago(item.subStatus) ? item.subStatus! : item.status;
    if (item.status !== statusEfetivo) {
      console.log(
        `[gateway/onetimepay] usando subStatus '${item.subStatus}' em vez de status '${item.status}' para ${pedido.numero}`,
      );
    }
    return {
      gatewayStatus: statusEfetivo,
      statusInterno: otp.mapearStatusPedido(statusEfetivo),
      transactionId: item.transactionId,
    };
  }

  if (gateway === "marchabb") {
    // MarchaBB precisa do ID da transacao (salvo em gateway_id no momento da criacao)
    if (!pedido.gateway_id) return null;
    const t = await mbb.consultarTransacaoPorId(pedido.gateway_id);
    if (!t?.status) return null;
    return {
      gatewayStatus: t.status,
      statusInterno: mbb.mapearStatusPedido(t.status),
      transactionId: String(t.id),
    };
  }

  // CenturionPay
  if (!pedido.gateway_id) return null;
  const t = await cp.consultarTransacaoPorId(pedido.gateway_id);
  if (!t?.status) return null;
  return {
    gatewayStatus: t.status,
    statusInterno: cp.mapearStatusPedido(t.status),
    transactionId: t.id,
  };
}

/** Mapeia status crua de qualquer gateway pro nosso status interno. */
export function mapearStatusInterno(gateway: GatewayId, statusCrua: string): string {
  if (gateway === "onetimepay") return otp.mapearStatusPedido(statusCrua);
  if (gateway === "marchabb") return mbb.mapearStatusPedido(statusCrua);
  return cp.mapearStatusPedido(statusCrua);
}
