import "server-only";

// =============================================================================
// Cliente Promst Pagamentos — gateway PIX simples (sem auth via header)
// Endpoint base: https://promstpagamentos.discloud.app
//
// Endpoints (formato REAL, validado contra a API em 05/2026):
//   GET /create_payment?user_id=<id>&valor=<reais>
//     -> {
//          calendario: { criacao: ISO, expiracao: 3600 },
//          txid: "TX-...",
//          status: "ATIVA",
//          valor: { original: "10.50" },   // string em decimal
//          devedor: { cpf, nome },         // recebedor (dono do user_id)
//          pixCopiaECola: "...",
//          qrcode_base64: "data:image/png;base64,iVBOR..."   // ja com prefixo
//        }
//   GET /verify_payment?payment_id=<txid>
//     -> { payment_id, cliente_id, expire_date (unix), status_pagamento,
//          valor (number), valor_liquido (number) }
//
// Particularidades:
//   - SEM postback/webhook documentado: a confirmacao depende do polling em
//     /api/pagamento/status/[numero] (a infra ja consulta o gateway a cada 2s).
//   - SEM dados do cliente: a API so pede `user_id` (vendedor) e `valor`.
//   - SEM `external_ref` ou metadata: a unica chave do nosso lado eh o `txid`
//     que retorna na criacao — salvamos em `gateway_id` e usamos pra consultar.
//   - Valor MINIMO: R$ 3,00 (lanca erro antes de chamar pra ja dar mensagem boa).
//   - O `qrcode_base64` ja vem com prefixo `data:` (apesar da doc dizer o
//     contrario). normalizarBase64 cobre os dois casos por seguranca.
//   - Expiracao do PIX: 3600s (1h) — info via calendario.expiracao.
// =============================================================================

const DEFAULT_BASE_URL = "https://promstpagamentos.discloud.app";
const VALOR_MINIMO_REAIS = 3;
// Fase sandbox: deixa o user_id default hardcoded pra nao depender de env na
// Vercel. Quando entrar em producao com varios sellers / quiser trocar de conta,
// basta setar PROMST_USER_ID nas envs do projeto que esse default eh ignorado.
const DEFAULT_USER_ID = "8758220378";

export type PromstConfig = {
  baseUrl: string;
  userId: string;
};

let avisouFallback = false;

function getConfig(): PromstConfig {
  const userIdEnv = process.env.PROMST_USER_ID;
  const userId = userIdEnv || DEFAULT_USER_ID;
  if (!userIdEnv && !avisouFallback) {
    console.warn(
      `[promst] PROMST_USER_ID nao definida — usando default sandbox ${DEFAULT_USER_ID}`,
    );
    avisouFallback = true;
  }
  return {
    baseUrl: process.env.PROMST_API_URL || DEFAULT_BASE_URL,
    userId,
  };
}

// =============== TYPES ===============

export type CriarPixInput = {
  /** Identificador unico do pedido (so usado em log — Promst nao aceita). */
  identifier: string;
  /** Valor TOTAL em REAIS DECIMAL (ex.: 25.5 = R$25,50) — minimo R$ 3,00. */
  amount: number;
};

export type CriarPixResposta = {
  /** txid retornado pela Promst — usado em `verify_payment`. */
  id: string;
  amount: number;
  status: string;
  pix: {
    /** Codigo copia-e-cola. */
    qrcode: string;
    /** Data URL pronto pra colocar em <img src>. */
    base64: string;
  };
  /** Segundos ate o PIX expirar (default 3600). */
  expiraEmSeg?: number;
};

export type ConsultarTransacaoResposta = {
  id: string;
  status: string;
  amount?: number;
  valorLiquido?: number;
};

// =============== HELPERS ===============

function reaisRedondo(v: number): number {
  return Number(v.toFixed(2));
}

/** Garante prefixo `data:image/png;base64,` se o gateway nao mandar. */
function normalizarBase64(b64: string | null | undefined): string {
  if (!b64) return "";
  if (b64.startsWith("data:")) return b64;
  return `data:image/png;base64,${b64}`;
}

// =============== API CALLS ===============

/**
 * GET /create_payment — cria uma cobranca PIX.
 */
export async function criarCobrancaPix(input: CriarPixInput): Promise<CriarPixResposta> {
  const cfg = getConfig();

  const valor = reaisRedondo(input.amount);
  if (!Number.isFinite(valor) || valor < VALOR_MINIMO_REAIS) {
    throw new Error(
      `Promst exige valor minimo de R$ ${VALOR_MINIMO_REAIS.toFixed(2)} (recebido R$ ${valor.toFixed(2)}).`,
    );
  }

  const url = new URL("/create_payment", cfg.baseUrl);
  url.searchParams.set("user_id", cfg.userId);
  url.searchParams.set("valor", valor.toFixed(2));

  console.log("[promst] GET", url.toString(), `pedido=${input.identifier}`);

  const r = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("[promst] resposta nao-JSON:", r.status, text);
    throw new Error(`Promst resposta nao-JSON (status ${r.status}): ${text.slice(0, 500)}`);
  }

  if (!r.ok) {
    console.error("[promst] erro:", r.status, JSON.stringify(data));
    const err = data as { message?: string; error?: string; detail?: string };
    throw new Error(
      `Promst PIX falhou (${r.status}): ${err.message ?? err.error ?? err.detail ?? text.slice(0, 400)}`,
    );
  }

  const t = data as {
    txid?: string;
    pixCopiaECola?: string;
    qrcode_base64?: string | null;
    status?: string;
    amount?: number;
    valor?: number | string | { original?: string | number };
    calendario?: { expiracao?: number };
  };

  if (!t.txid || !t.pixCopiaECola) {
    throw new Error(
      `Promst resposta sem txid/pixCopiaECola: ${text.slice(0, 500)}`,
    );
  }

  // O `valor` pode vir como number direto, string, ou objeto { original }.
  // Cobrimos todos os casos pra a gente nao quebrar se a Promst mudar o
  // shape da resposta de novo (foi esse o caso entre doc e API real).
  let amount = valor;
  if (typeof t.amount === "number") amount = t.amount;
  else if (typeof t.valor === "number") amount = t.valor;
  else if (typeof t.valor === "string") amount = Number(t.valor);
  else if (t.valor && typeof t.valor === "object") {
    const o = t.valor.original;
    const n = typeof o === "number" ? o : typeof o === "string" ? Number(o) : NaN;
    if (Number.isFinite(n)) amount = n;
  }

  return {
    id: t.txid,
    amount,
    status: t.status ?? "ATIVA",
    pix: {
      qrcode: t.pixCopiaECola,
      base64: normalizarBase64(t.qrcode_base64 ?? null),
    },
    expiraEmSeg: typeof t.calendario?.expiracao === "number" ? t.calendario.expiracao : undefined,
  };
}

/**
 * GET /verify_payment — consulta o status de uma transacao.
 */
export async function consultarTransacaoPorId(txid: string): Promise<ConsultarTransacaoResposta> {
  const cfg = getConfig();
  const url = new URL("/verify_payment", cfg.baseUrl);
  url.searchParams.set("payment_id", txid);

  const r = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Promst resposta nao-JSON (status ${r.status}): ${text.slice(0, 300)}`);
  }
  if (!r.ok) {
    throw new Error(`Promst consulta falhou (${r.status}): ${text.slice(0, 300)}`);
  }

  const t = data as {
    payment_id?: string;
    status_pagamento?: string;
    valor?: number;
    valor_liquido?: number;
  };

  return {
    id: t.payment_id ?? txid,
    status: t.status_pagamento ?? "PENDENTE",
    amount: typeof t.valor === "number" ? t.valor : undefined,
    valorLiquido: typeof t.valor_liquido === "number" ? t.valor_liquido : undefined,
  };
}

/**
 * Mapeia status da Promst pro nosso enum interno.
 * Conhecidos (deduzidos da doc):
 *   ATIVA / PENDENTE                         -> aguardando_pagamento
 *   CONCLUIDA / CONCLUÍDA / PAGA / PAID      -> pago
 *   EXPIRADA / CANCELADA / REMOVIDA          -> cancelado
 */
export function mapearStatusPedido(promstStatus: string): string {
  const s = (promstStatus || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (s === "CONCLUIDA" || s === "PAGA" || s === "PAID" || s === "APPROVED") {
    return "pago";
  }
  if (
    s === "EXPIRADA" ||
    s === "CANCELADA" ||
    s === "REMOVIDA" ||
    s === "CANCELED" ||
    s === "FAILED"
  ) {
    return "cancelado";
  }
  // ATIVA, PENDENTE, AGUARDANDO e desconhecidos -> aguardando
  return "aguardando_pagamento";
}
