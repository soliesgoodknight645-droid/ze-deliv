import "server-only";

// Cliente OneTimePay — gateway de pagamento PIX
// Doc: https://app.onetimepay.com.br/docs
// Endpoint base extraido do bundle do site:
//   getApiBaseUrl(domain) => `https://${domain}/api/v1`
// Para a propria OneTimePay: https://app.onetimepay.com.br/api/v1

const DEFAULT_BASE_URL = "https://app.onetimepay.com.br/api/v1";

export type OneTimePayConfig = {
  baseUrl?: string;
  publicKey: string;
  secretKey: string;
};

function getConfig(): OneTimePayConfig {
  const publicKey = process.env.ONETIMEPAY_PUBLIC_KEY;
  const secretKey = process.env.ONETIMEPAY_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new Error(
      "OneTimePay nao configurado. Defina ONETIMEPAY_PUBLIC_KEY e ONETIMEPAY_SECRET_KEY no .env.local",
    );
  }
  return {
    baseUrl: process.env.ONETIMEPAY_API_URL || DEFAULT_BASE_URL,
    publicKey,
    secretKey,
  };
}

function authHeaders() {
  const cfg = getConfig();
  return {
    "x-public-key": cfg.publicKey,
    "x-secret-key": cfg.secretKey,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

// =============== TYPES ===============

export type OtpClient = {
  name: string;
  email: string;
  /** formato (11) 99999-9999 */
  phone: string;
  /** CPF ou CNPJ formatado (123.456.789-00) */
  document: string;
};

export type OtpProduct = {
  id: string;
  name: string;
  quantity?: number;
  price: number; // em REAIS (nao centavos)
  physical?: boolean;
};

export type CriarPixInput = {
  /** Identificador unico da transacao (no nosso caso, o numero do pedido) */
  identifier: string;
  /** Valor TOTAL em reais (ex: 19.90) */
  amount: number;
  shippingFee?: number;
  extraFee?: number;
  discount?: number;
  client: OtpClient;
  products?: OtpProduct[];
  /** YYYY-MM-DD — vencimento da cobranca */
  dueDate?: string;
  metadata?: Record<string, unknown>;
  /** URL pra receber webhook (TRANSACTION_PAID etc) */
  callbackUrl?: string;
};

export type CriarPixResposta = {
  transactionId: string;
  status: string;
  order?: {
    id: string;
    url?: string;
    receiptUrl?: string;
  };
  pix: {
    /** Codigo copia e cola */
    code: string;
    /** Imagem em base64 (data:image/png;base64,...) */
    base64?: string;
    /** URL externa da imagem do QR Code */
    image?: string;
  };
};

export type CriarPixErro = {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
};

// =============== HELPERS ===============

/**
 * Garante que telefone tem exatamente 11 digitos (com 9) ou 10 digitos
 * e formata como (XX) XXXXX-XXXX
 */
function formatarTelefonePraOtp(telefone: string): string {
  const d = telefone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

function formatarDocumento(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc;
}

// =============== API CALLS ===============

/**
 * POST /gateway/pix/receive — gera uma cobranca PIX (QR Code copia e cola).
 *
 * Resposta tipica (201):
 *   {
 *     transactionId: "clxxx...",
 *     status: "OK",
 *     order: { id, url, receiptUrl },
 *     pix: { code, base64, image }
 *   }
 */
export async function criarCobrancaPix(input: CriarPixInput): Promise<CriarPixResposta> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/gateway/pix/receive`;

  // dueDate default = amanha (formato YYYY-MM-DD)
  const dueDateDefault = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  // OBS:
  // - NAO enviamos `products` (OneTimePay tenta casar com catalogo do painel deles
  //   e devolve "Invalid products. Some products are not available for sale.")
  // - NAO enviamos `metadata` aninhado (a API deles devolve 500 generico
  //   "An unexpected error occurred"). A lista de itens fica salva no Supabase.
  const body = {
    identifier: input.identifier,
    amount: Number(input.amount.toFixed(2)),
    shippingFee: input.shippingFee != null ? Number(input.shippingFee.toFixed(2)) : undefined,
    extraFee: input.extraFee != null ? Number(input.extraFee.toFixed(2)) : undefined,
    discount: input.discount != null ? Number(input.discount.toFixed(2)) : undefined,
    client: {
      name: input.client.name.trim(),
      email: input.client.email.trim().toLowerCase(),
      phone: formatarTelefonePraOtp(input.client.phone),
      document: formatarDocumento(input.client.document),
    },
    dueDate: input.dueDate ?? dueDateDefault,
    callbackUrl: input.callbackUrl,
  };

  // log do que vamos mandar (sem expor chaves)
  console.log("[onetimepay] POST", url, JSON.stringify(body));

  const r = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("[onetimepay] resposta nao-JSON:", r.status, text);
    throw new Error(`OneTimePay resposta nao-JSON (status ${r.status}): ${text.slice(0, 500)}`);
  }

  if (!r.ok) {
    console.error("[onetimepay] erro:", r.status, JSON.stringify(data));
    const err = data as Partial<CriarPixErro> & { details?: unknown; errors?: unknown };
    const detalhes =
      err.details || err.errors
        ? ` | detalhes: ${JSON.stringify(err.details ?? err.errors)}`
        : ` | body: ${text.slice(0, 800)}`;
    throw new Error(
      `OneTimePay PIX falhou (${err.statusCode ?? r.status} ${err.errorCode ?? ""}): ${
        err.message ?? "erro desconhecido"
      }${detalhes}`,
    );
  }

  return data as CriarPixResposta;
}

/**
 * GET /gateway/transactions?identifier=... — consulta transacao por nosso identificador.
 * Util pra polling caso o webhook nao chegue por algum motivo.
 */
export type ConsultarTransacaoResposta = {
  success?: boolean;
  data?: {
    items?: Array<{
      transactionId: string;
      status: string;
      subStatus?: string;
      paymentMethod?: string;
      payedAt?: string | null;
    }>;
  };
  // formato simplificado pra um item so
  transactionId?: string;
  status?: string;
  subStatus?: string;
};

export async function consultarTransacaoPorIdentifier(identifier: string) {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/gateway/transactions?identifier=${encodeURIComponent(identifier)}`;

  const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`OneTimePay resposta nao-JSON (status ${r.status}): ${text.slice(0, 300)}`);
  }
  if (!r.ok) {
    throw new Error(`OneTimePay consulta falhou (${r.status}): ${text.slice(0, 200)}`);
  }
  return data as ConsultarTransacaoResposta;
}

/**
 * Status que indicam pagamento confirmado em alguma adquirente da OneTimePay.
 * Quando a adquirente muda (já aconteceu na pratica), o status retornado pode
 * variar. Mantemos uma lista bem permissiva — sempre que o backend conseguir
 * provar que entrou dinheiro, o pedido vira `pago`.
 */
const STATUS_PAGOS = new Set([
  "COMPLETED",
  "PAID",
  "APPROVED",
  "AUTHORIZED",
  "CONFIRMED",
  "RECEIVED",
  "SETTLED",
  "SUCCESS",
  "SUCCEEDED",
  "FINISHED",
  "DONE",
  "OK",
]);

const STATUS_CANCELADOS = new Set([
  "FAILED",
  "FAIL",
  "CANCELED",
  "CANCELLED",
  "REJECTED",
  "DECLINED",
  "EXPIRED",
  "REFUNDED",
  "CHARGED_BACK",
  "CHARGEBACK",
]);

/**
 * Eventos do webhook que indicam que entrou dinheiro. Mantido permissivo
 * pelo mesmo motivo do `STATUS_PAGOS`.
 */
const EVENTOS_PAGOS = new Set([
  "TRANSACTION_PAID",
  "TRANSACTION_APPROVED",
  "TRANSACTION_RECEIVED",
  "TRANSACTION_COMPLETED",
  "TRANSACTION_CONFIRMED",
  "TRANSACTION_SETTLED",
  "PIX_RECEIVED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_APPROVED",
]);

const EVENTOS_CANCELADOS = new Set([
  "TRANSACTION_CANCELED",
  "TRANSACTION_CANCELLED",
  "TRANSACTION_FAILED",
  "TRANSACTION_EXPIRED",
  "TRANSACTION_REFUNDED",
  "TRANSACTION_CHARGEBACK",
]);

/**
 * Mapeia status da OneTimePay pra nosso enum de status do pedido.
 *
 * Aceita as variacoes conhecidas das adquirentes que ja vimos na OneTimePay.
 * Se chegar um status fora da lista, loga `console.warn` (aparece no Vercel)
 * pra a gente conseguir adicionar a variacao depois — mas trata como
 * `aguardando_pagamento` por padrao pra nao confirmar pagamento por engano.
 */
export function mapearStatusPedido(otpStatus: string): string {
  const s = otpStatus.toUpperCase();
  if (STATUS_PAGOS.has(s)) return "pago";
  if (STATUS_CANCELADOS.has(s)) return "cancelado";
  if (s !== "PENDING" && s !== "WAITING" && s !== "PROCESSING" && s !== "CREATED") {
    console.warn("[onetimepay] status desconhecido:", otpStatus);
  }
  return "aguardando_pagamento";
}

/** Indica se um status do gateway representa pagamento concluido. */
export function statusEhPago(otpStatus?: string | null): boolean {
  if (!otpStatus) return false;
  return STATUS_PAGOS.has(otpStatus.toUpperCase());
}

/** Indica se um evento de webhook representa pagamento concluido. */
export function eventoEhPago(evento?: string | null): boolean {
  if (!evento) return false;
  return EVENTOS_PAGOS.has(evento.toUpperCase());
}

/** Indica se um evento de webhook representa cancelamento/estorno. */
export function eventoEhCancelado(evento?: string | null): boolean {
  if (!evento) return false;
  return EVENTOS_CANCELADOS.has(evento.toUpperCase());
}
