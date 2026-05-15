import "server-only";

// =============================================================================
// Cliente HyzePay — gateway PIX brasileiro
// Doc oficial: https://hyzepay.readme.io/reference/introducao
//
// Auth:        Basic Base64(PUBLIC_KEY:SECRET_KEY)
// Base URL:    https://api.hyzepay.com
// Endpoints:
//   POST /v1/payment-transaction/create        -> cria transacao
//   GET  /v1/payment-transaction/info/{id}     -> consulta transacao
//   POST /v1/payment-transaction/{id}/refund   -> estorna
//
// Convencoes IMPORTANTES:
//   - Body em snake_case (postback_url, payment_method, expires_in_days...)
//   - Valores `amount` e `unit_price` em REAIS DECIMAL (ex.: 120.5 = R$120,50).
//     A doc tem uma inconsistencia ("Total amount in cents") mas o exemplo
//     do request, o webhook ("Em reais") e o exemplo de resposta usam
//     decimal. Adotamos REAIS DECIMAL.
//   - `pix.expires_in_days` (integer) — nao eh data, eh quantidade de dias.
//   - Resposta vem em `{ data: [{ id, status, pix: [{ qr_code, ... }], ...}] }`
//     (data eh array, pix tambem eh array aninhado).
//   - Status PADRAO uppercase: PENDING/PAID/REFUNDED/REFUSED/CHARGEBACK/
//     PRECHARGEBACK/EXPIRED/ERROR
// =============================================================================

const DEFAULT_BASE_URL = "https://api.hyzepay.com";

export type HyzePayConfig = {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
};

function getConfig(): HyzePayConfig {
  const publicKey = process.env.HYZEPAY_PUBLIC_KEY;
  const secretKey = process.env.HYZEPAY_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new Error(
      "HyzePay nao configurada. Defina HYZEPAY_PUBLIC_KEY e HYZEPAY_SECRET_KEY no .env.local",
    );
  }
  return {
    baseUrl: process.env.HYZEPAY_API_URL || DEFAULT_BASE_URL,
    publicKey,
    secretKey,
  };
}

function authHeaders() {
  const cfg = getConfig();
  const token = Buffer.from(`${cfg.publicKey}:${cfg.secretKey}`).toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  } as Record<string, string>;
}

// =============== TYPES ===============

export type CriarPixInput = {
  /** Identificador unico (pedido.numero) — vai como external_ref nos items + metadata */
  identifier: string;
  /** Valor TOTAL em REAIS DECIMAL (ex.: 25.5 = R$25,50) */
  amount: number;
  client: {
    name: string;
    email: string;
    phone: string;
    document: string;
  };
  endereco?: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  items: Array<{ title: string; quantity: number; price: number; tangible?: boolean }>;
  /** Dias ate a expiracao do PIX (default 1) */
  expiresInDays?: number;
  /** URL pra receber postback (webhook) */
  postbackUrl?: string;
  metadata?: Record<string, unknown>;
  /** IP do cliente (recomendado pelo gateway pra antifraude) */
  ip?: string;
};

export type CriarPixResposta = {
  id: string;
  amount: number;
  status: string;
  paymentMethod: string;
  postbackUrl?: string | null;
  pix: {
    qrcode: string;
    expirationDate?: string | null;
    e2e?: string | null;
    receiptUrl?: string | null;
  };
};

// =============== HELPERS ===============

function digitos(s: string) {
  return s.replace(/\D/g, "");
}

function inferirTipoDocumento(doc: string): "cpf" | "cnpj" {
  return digitos(doc).length === 14 ? "cnpj" : "cpf";
}

/** Arredonda pra 2 casas (evita 0.1+0.2=0.30000000004 nas chamadas). */
function reaisRedondo(v: number): number {
  return Number(v.toFixed(2));
}

/**
 * Extrai o primeiro item util de um campo que a doc descreve como array.
 * Cobre tambem o caso de a API mandar como objeto direto (alguns
 * gateways "achatam" quando ha so um item).
 */
function pickFirst<T>(v: T | T[] | undefined | null): T | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

// =============== API CALLS ===============

/**
 * POST /v1/payment-transaction/create — cria uma transacao PIX
 */
export async function criarCobrancaPix(input: CriarPixInput): Promise<CriarPixResposta> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/v1/payment-transaction/create`;

  const docDigits = digitos(input.client.document);
  const phoneDigits = digitos(input.client.phone);

  const items = input.items.map((i) => ({
    title: i.title.slice(0, 200),
    unit_price: reaisRedondo(i.price),
    quantity: i.quantity,
    tangible: i.tangible ?? true,
    external_ref: input.identifier,
  }));

  const customer = {
    name: input.client.name.trim(),
    email: input.client.email.trim().toLowerCase(),
    phone: phoneDigits,
    document: {
      number: docDigits,
      type: inferirTipoDocumento(input.client.document),
    },
  };

  const body: Record<string, unknown> = {
    amount: reaisRedondo(input.amount),
    payment_method: "pix",
    postback_url: input.postbackUrl ?? "https://example.invalid/webhook",
    customer,
    items,
    pix: {
      expires_in_days: input.expiresInDays ?? 1,
    },
    metadata: JSON.stringify({
      identifier: input.identifier,
      ...(input.metadata ?? {}),
    }),
    ip: input.ip ?? "0.0.0.0",
  };

  if (input.endereco) {
    body.shipping = {
      fee: 0,
      address: {
        street: input.endereco.street,
        street_number: input.endereco.number,
        complement: input.endereco.complement || "",
        zip_code: digitos(input.endereco.cep),
        neighborhood: input.endereco.neighborhood,
        city: input.endereco.city,
        state: input.endereco.state,
        country: "BR",
      },
    };
  }

  console.log("[hyzepay] POST", url, JSON.stringify(body));

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
    console.error("[hyzepay] resposta nao-JSON:", r.status, text);
    throw new Error(`HyzePay resposta nao-JSON (status ${r.status}): ${text.slice(0, 500)}`);
  }

  if (!r.ok) {
    console.error("[hyzepay] erro:", r.status, JSON.stringify(data));
    const err = data as {
      message?: string;
      error?: string;
      errors?: unknown;
    };
    throw new Error(
      `HyzePay PIX falhou (${r.status}): ${
        err.message ?? err.error ?? JSON.stringify(err.errors ?? data).slice(0, 500)
      }`,
    );
  }

  // A doc oficial diz que a resposta vem em { data: [{...}] } com pix
  // tambem como array. Mas o exemplo "ad-hoc" do README mostra um objeto
  // flat ({ id, status, ... }). Suportamos os dois pra robustez.
  const wrapped = data as { data?: unknown };
  const tx = (pickFirst(wrapped.data) ?? data) as Record<string, unknown> | undefined;

  if (!tx) {
    throw new Error(`HyzePay resposta vazia/sem transacao: ${text.slice(0, 500)}`);
  }

  const id = tx.id != null ? String(tx.id) : null;
  const statusBruto = (tx.status as string | undefined) ?? "PENDING";

  const pixObj = pickFirst(tx.pix as unknown) as Record<string, unknown> | undefined;
  const qrcode =
    (pixObj?.qr_code as string | undefined) ??
    (pixObj?.qrcode as string | undefined) ??
    (pixObj?.code as string | undefined) ??
    null;

  if (statusBruto === "REFUSED" || statusBruto === "ERROR") {
    throw new Error(
      `HyzePay recusou (${statusBruto}): ${text.slice(0, 500)}`,
    );
  }

  if (!id || !qrcode) {
    throw new Error(
      `HyzePay resposta sem id/qrcode (id=${id}, qrcode=${qrcode ? "ok" : "null"}): ${text.slice(0, 600)}`,
    );
  }

  return {
    id,
    amount: typeof tx.amount === "number" ? (tx.amount as number) : reaisRedondo(input.amount),
    status: statusBruto,
    paymentMethod: (tx.payment_method as string | undefined) ?? "pix",
    postbackUrl: (tx.postback_url as string | undefined) ?? null,
    pix: {
      qrcode,
      expirationDate: (pixObj?.expiration_date as string | undefined) ?? null,
      e2e:
        (pixObj?.e2_e as string | undefined) ??
        (pixObj?.e2e as string | undefined) ??
        null,
      receiptUrl: (pixObj?.url as string | undefined) ?? null,
    },
  };
}

/**
 * GET /v1/payment-transaction/info/{id} — consulta uma transacao
 */
export type ConsultarTransacaoResposta = {
  id: string;
  status: string;
  paymentMethod?: string;
  externalId?: string | null;
  paidAt?: string | null;
  amount?: number;
};

export async function consultarTransacaoPorId(id: string): Promise<ConsultarTransacaoResposta> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/v1/payment-transaction/info/${encodeURIComponent(id)}`;
  const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`HyzePay resposta nao-JSON (status ${r.status}): ${text.slice(0, 300)}`);
  }
  if (!r.ok) {
    throw new Error(`HyzePay consulta falhou (${r.status}): ${text.slice(0, 300)}`);
  }
  // Pode vir tanto flat quanto wrapped em data[]
  const wrapped = data as { data?: unknown };
  const tx = (pickFirst(wrapped.data) ?? data) as Record<string, unknown>;
  return {
    id: tx.id != null ? String(tx.id) : id,
    status: (tx.status as string | undefined) ?? "PENDING",
    paymentMethod: tx.payment_method as string | undefined,
    externalId: (tx.external_id as string | undefined) ?? null,
    paidAt: (tx.paid_at as string | undefined) ?? null,
    amount: typeof tx.amount === "number" ? (tx.amount as number) : undefined,
  };
}

/**
 * Mapeia o status da HyzePay (uppercase) pro nosso enum interno.
 * Aceita case-insensitive por robustez.
 */
export function mapearStatusPedido(hzStatus: string): string {
  const s = (hzStatus || "").toUpperCase();
  if (s === "PAID") return "pago";
  if (
    s === "REFUSED" ||
    s === "EXPIRED" ||
    s === "ERROR" ||
    s === "FAILED" ||
    s === "REFUNDED" ||
    s === "CHARGEBACK"
  ) {
    return "cancelado";
  }
  // PENDING, PRECHARGEBACK e desconhecidos -> aguardando
  return "aguardando_pagamento";
}
