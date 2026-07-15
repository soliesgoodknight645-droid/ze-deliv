import "server-only";
import crypto from "node:crypto";

// =============================================================================
// Cliente PlayPayments — gateway PIX brasileiro
// Doc oficial: https://app.playpayments.com.br/docs
//
// Auth:        Bearer sk_prod_... (Secret Key) no header Authorization
// Base URL:    https://app.playpayments.com.br/api
// Endpoints:
//   POST /pix              -> cria cobranca PIX
//   GET  /pix/{id}         -> consulta cobranca completa
//   GET  /pix/status/{id}  -> status leve (ideal pra polling)
//
// Convencoes IMPORTANTES:
//   - Valores em REAIS DECIMAL (ex.: 150.00 = R$150,00), minimo 0.01
//   - `external_id` = nosso pedido.numero (idempotencia + rastreio; volta no
//     webhook como external_id)
//   - `expires_in` em SEGUNDOS (min 60, default 3600, max 86400)
//   - Resposta flat: { success, transaction_id, pix_code, qr_code, status, ... }
//   - Status lowercase: pending | paid | expired | cancelled | failed
//   - Webhook NAO eh configurado por request — eh global, no painel deles
//     (Configuracoes -> Webhooks). Payload: { event: "transaction.paid",
//     transaction_id, external_id, amount, status, paid_at, customer }
// =============================================================================

const DEFAULT_BASE_URL = "https://app.playpayments.com.br/api";

type PlayPaymentsConfig = {
  baseUrl: string;
  secretKey: string;
};

function getConfig(): PlayPaymentsConfig {
  const secretKey = process.env.PLAYPAYMENTS_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "PlayPayments nao configurada. Defina PLAYPAYMENTS_SECRET_KEY no .env.local",
    );
  }
  return {
    baseUrl: process.env.PLAYPAYMENTS_API_URL || DEFAULT_BASE_URL,
    secretKey,
  };
}

function authHeaders(): Record<string, string> {
  const cfg = getConfig();
  return {
    Authorization: `Bearer ${cfg.secretKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// =============== TYPES ===============

export type CriarPixInput = {
  /** Identificador unico (pedido.numero) — vai como external_id */
  identifier: string;
  /** Valor TOTAL em REAIS DECIMAL (ex.: 25.5 = R$25,50) — minimo 0.01 */
  amount: number;
  client: {
    name: string;
    email: string;
    phone: string;
    document: string;
  };
  items?: Array<{ title: string; quantity: number; price: number }>;
  /** Expiracao em segundos (min 60, default 3600 = 1h, max 86400) */
  expiresIn?: number;
  /** Titulo exibido no recibo (max 100 chars) */
  title?: string;
  /** IP real do comprador (geolocalizacao no dashboard deles) */
  ip?: string;
};

export type CriarPixResposta = {
  id: string;
  amount: number;
  status: string;
  pix: {
    qrcode: string;
  };
  expiresAt?: string | null;
};

// =============== HELPERS ===============

function digitos(s: string) {
  return s.replace(/\D/g, "");
}

function reaisRedondo(v: number): number {
  return Number(v.toFixed(2));
}

// =============== API CALLS ===============

/**
 * POST /pix — cria uma cobranca PIX
 */
export async function criarCobrancaPix(input: CriarPixInput): Promise<CriarPixResposta> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/pix`;

  const body: Record<string, unknown> = {
    payment_method: "pix",
    amount: reaisRedondo(input.amount),
    customer: {
      name: input.client.name.trim(),
      email: input.client.email.trim().toLowerCase(),
      document: digitos(input.client.document),
      phone: digitos(input.client.phone) || undefined,
    },
    external_id: input.identifier,
    title: (input.title ?? `Pedido ${input.identifier}`).slice(0, 100),
    expires_in: input.expiresIn ?? 3600,
  };

  if (input.items?.length) {
    body.cart = input.items.map((i) => ({
      title: i.title.slice(0, 100),
      price: reaisRedondo(i.price),
      quantity: i.quantity,
    }));
  }
  if (input.ip && input.ip !== "0.0.0.0") {
    body.customer_ip = input.ip;
  }

  console.log("[playpayments] POST", url, JSON.stringify(body));

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
    console.error("[playpayments] resposta nao-JSON:", r.status, text);
    throw new Error(
      `PlayPayments resposta nao-JSON (status ${r.status}): ${text.slice(0, 500)}`,
    );
  }

  const resp = data as {
    success?: boolean;
    error?: string;
    errors?: unknown;
    transaction_id?: string;
    pix_code?: string;
    qr_code?: string;
    amount?: number;
    status?: string;
    expires_at?: string;
  };

  if (!r.ok || resp.success === false) {
    console.error("[playpayments] erro:", r.status, JSON.stringify(data));
    throw new Error(
      `PlayPayments PIX falhou (${r.status}): ${
        resp.error ?? JSON.stringify(resp.errors ?? data).slice(0, 500)
      }`,
    );
  }

  const id = resp.transaction_id != null ? String(resp.transaction_id) : null;
  const qrcode = resp.pix_code ?? resp.qr_code ?? null;

  if (!id || !qrcode) {
    throw new Error(
      `PlayPayments resposta sem id/pix_code (id=${id}, pix_code=${qrcode ? "ok" : "null"}): ${text.slice(0, 600)}`,
    );
  }

  return {
    id,
    amount: typeof resp.amount === "number" ? resp.amount : reaisRedondo(input.amount),
    status: resp.status ?? "pending",
    pix: { qrcode },
    expiresAt: resp.expires_at ?? null,
  };
}

/**
 * GET /pix/status/{id} — consulta leve de status (ideal pra polling)
 */
export type ConsultarTransacaoResposta = {
  id: string;
  status: string;
  paidAt?: string | null;
  amount?: number;
};

export async function consultarTransacaoPorId(id: string): Promise<ConsultarTransacaoResposta> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/pix/status/${encodeURIComponent(id)}`;
  const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `PlayPayments resposta nao-JSON (status ${r.status}): ${text.slice(0, 300)}`,
    );
  }
  if (!r.ok) {
    throw new Error(`PlayPayments consulta falhou (${r.status}): ${text.slice(0, 300)}`);
  }
  const resp = data as {
    transaction_id?: string;
    status?: string;
    paid_at?: string;
    amount?: number;
  };
  return {
    id: resp.transaction_id != null ? String(resp.transaction_id) : id,
    status: resp.status ?? "pending",
    paidAt: resp.paid_at ?? null,
    amount: typeof resp.amount === "number" ? resp.amount : undefined,
  };
}

// =============== WEBHOOK — VERIFICACAO DE ASSINATURA ===============
//
// A doc publica da Play Payments NAO descreve o formato/header da assinatura
// do webhook, mas eles fornecem um signing secret `whsec_...`. Seguindo o
// padrao de mercado (GoatPay, Polp, Stripe-like), assumimos HMAC-SHA256 sobre
// o RAW BODY, com a assinatura em algum header conhecido, em um destes
// formatos:
//   - "sha256=<hex>"           (GoatPay/Polp)
//   - "<hex>" puro
//   - "t=<unix>,v1=<hex>"      (Stripe-like: HMAC de `${t}.${rawBody}`)
//
// Como nao temos certeza do header exato, esta funcao eh TOLERANTE: so
// consegue "verificar" quando acha um header reconhecido que bate. O caller
// decide o que fazer (por padrao NAO bloqueia, so loga — pra nao perder
// confirmacao de pagamento real caso o esquema real seja diferente do
// assumido; a confirmacao por polling continua como rede de seguranca).

const HEADERS_ASSINATURA = [
  "x-playpayments-signature",
  "x-play-signature",
  "x-webhook-signature",
  "x-signature",
  "webhook-signature",
  "signature",
];

export type ResultadoAssinatura = {
  /** true => header encontrado E assinatura confere */
  valido: boolean;
  /** motivo/estado pra log ("sem_secret" | "sem_header" | "invalida" | "ok") */
  motivo: string;
  /** header que casou (se algum) */
  header?: string;
};

function compararHmacConstante(esperadoHex: string, recebido: string): boolean {
  // recebido pode vir em hex ou base64 — tenta os dois.
  const esperadoBuf = Buffer.from(esperadoHex, "hex");
  const candidatos: Buffer[] = [];
  if (/^[0-9a-f]+$/i.test(recebido)) candidatos.push(Buffer.from(recebido, "hex"));
  try {
    candidatos.push(Buffer.from(recebido, "base64"));
  } catch {
    // ignora
  }
  return candidatos.some(
    (b) => b.length === esperadoBuf.length && crypto.timingSafeEqual(b, esperadoBuf),
  );
}

/**
 * Verifica a assinatura HMAC-SHA256 do webhook (best-effort — ver comentario
 * acima). `headers` deve ser um objeto com as chaves em lowercase.
 */
export function verificarAssinaturaWebhook(
  rawBody: string,
  headers: Record<string, string | undefined>,
): ResultadoAssinatura {
  const secret = process.env.PLAYPAYMENTS_WEBHOOK_SECRET;
  if (!secret) return { valido: false, motivo: "sem_secret" };

  let headerNome: string | undefined;
  let headerValor: string | undefined;
  for (const h of HEADERS_ASSINATURA) {
    const v = headers[h];
    if (v) {
      headerNome = h;
      headerValor = v;
      break;
    }
  }
  if (!headerValor) return { valido: false, motivo: "sem_header" };

  // Formato Stripe-like: "t=<unix>,v1=<hex>[,v1=<hex>]"
  if (/(^|,)\s*t=/.test(headerValor) && /v1=/.test(headerValor)) {
    const partes = Object.fromEntries(
      headerValor.split(",").map((kv) => {
        const [k, ...rest] = kv.trim().split("=");
        return [k, rest.join("=")];
      }),
    ) as Record<string, string>;
    const t = partes["t"];
    const assinaturas = headerValor
      .split(",")
      .filter((kv) => kv.trim().startsWith("v1="))
      .map((kv) => kv.trim().slice(3));
    if (t) {
      const esperado = crypto
        .createHmac("sha256", secret)
        .update(`${t}.${rawBody}`)
        .digest("hex");
      const ok = assinaturas.some((sig) => compararHmacConstante(esperado, sig));
      return { valido: ok, motivo: ok ? "ok" : "invalida", header: headerNome };
    }
  }

  // Formato simples: "sha256=<hex>" ou "<hex/base64>" puro, HMAC do raw body.
  const recebido = headerValor.startsWith("sha256=")
    ? headerValor.slice("sha256=".length)
    : headerValor;
  const esperado = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const ok = compararHmacConstante(esperado, recebido.trim());
  return { valido: ok, motivo: ok ? "ok" : "invalida", header: headerNome };
}

/**
 * Mapeia o status da PlayPayments (lowercase) pro nosso enum interno.
 */
export function mapearStatusPedido(ppStatus: string): string {
  const s = (ppStatus || "").toLowerCase();
  if (s === "paid") return "pago";
  if (s === "expired" || s === "cancelled" || s === "canceled" || s === "failed") {
    return "cancelado";
  }
  // pending e desconhecidos -> aguardando
  return "aguardando_pagamento";
}
