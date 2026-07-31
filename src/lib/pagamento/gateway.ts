import "server-only";

import * as otp from "@/lib/onetimepay";
import * as mbb from "@/lib/marchabb";
import * as cp from "@/lib/centurionpay";
import * as hz from "@/lib/hyzepay";
import * as pp from "@/lib/playpayments";
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
//
// FAILOVER AUTOMATICO (06/05/2026)
// --------------------------------
// Se o gateway escolhido pelo admin falhar (timeout/5xx/refused/qrcode vazio),
// o checkout NAO deixa o cliente na mao — ele tenta automaticamente os outros
// gateways na ordem de prioridade. Assim, mesmo com um gateway inteiro fora do
// ar, os pedidos continuam fechando.
//
// Prioridade (taxa + conversao):
//   1. MarchaBB
//   2. OneTimePay
//   3. CenturionPay (fallback de emergencia)
//
// Circuit breaker: se um gateway falhar, ele entra em "cooldown" por
// COOLDOWN_MS — tentativas seguintes pulam ele (vai pro fim da fila), pra
// nao desperdicar o tempo de checkout do cliente em algo que ja esta down.
// =====================================================================

export type GatewayId =
  | "onetimepay"
  | "marchabb"
  | "centurionpay"
  | "hyzepay"
  | "playpayments";

const GATEWAY_IDS: GatewayId[] = [
  "onetimepay",
  "marchabb",
  "centurionpay",
  "hyzepay",
  "playpayments",
];

/**
 * Ordem de prioridade canonica usada pra montar a fila de failover.
 * Os primeiros sao "tier 1" (melhor taxa/conversao). CenturionPay fica
 * por ultimo como fallback de emergencia.
 */
const PRIORIDADE_FAILOVER: GatewayId[] = [
  "marchabb",
  "onetimepay",
  "hyzepay",
  "playpayments",
  "centurionpay",
];

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
    id: "hyzepay",
    label: "HyzePay",
    descricao: "Gateway PIX — Basic Auth (public:secret), valor em centavos",
  },
  {
    id: "playpayments",
    label: "Play Payments",
    descricao: "Gateway PIX — Bearer secret key, valor em reais (webhook configurado no painel deles)",
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
  // Quando o admin troca pra um gateway, limpa qualquer cooldown ativo dele —
  // assim a primeira tentativa apos a troca eh REAL (em vez de cair direto pro
  // failover por causa de uma falha antiga). O cooldown eh em memoria e por
  // instancia, entao isso so afeta a instancia atual; outras instancias vao
  // tentar tambem na proxima requisicao, e se ainda estiver quebrado vao
  // marcar o cooldown delas. O `app_config` `gateway_status_last:hyzepay`
  // tambem eh limpo pra a UI nao mostrar erro velho.
  cooldown.delete(gateway);
  await registrarResultadoNoBanco(gateway, { resetado: true, atualizadoPor });
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
// Webhook URL helper — cada gateway tem o proprio endpoint (formato de body
// diferente). Quando o failover muda o gateway, a callbackUrl tem que mudar
// junto, senao o webhook chega na rota errada e o pedido nunca confirma.
// =====================================================================

export function webhookUrlParaGateway(gateway: GatewayId): string | undefined {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  // Gateways rejeitam callbackUrl em localhost/IP privado. Em dev usamos
  // polling no /api/pagamento/status/[numero] pra confirmar o pagamento.
  const ehLocal = /^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.)/i.test(siteUrl);
  if (ehLocal) return undefined;
  const base = siteUrl.replace(/\/$/, "");
  if (gateway === "marchabb") return `${base}/api/pagamento/webhook/marchabb`;
  if (gateway === "centurionpay") return `${base}/api/pagamento/webhook/centurionpay`;
  if (gateway === "hyzepay") return `${base}/api/pagamento/webhook/hyzepay`;
  if (gateway === "playpayments") return `${base}/api/pagamento/webhook/playpayments`;
  return `${base}/api/pagamento/webhook`;
}

// =====================================================================
// Circuit breaker (cooldown apos falha)
//
// Em memoria — cada instancia serverless mantem o proprio mapa, o que ja
// resolve a maioria dos casos: uma instancia que ja viu o gateway falhar
// pula ele nas proximas requisicoes. Quando o gateway voltar, o cooldown
// expira e a gente tenta de novo.
// =====================================================================

const COOLDOWN_MS = 5 * 60_000; // 5 min apos falha
const FALHAS_PRA_QUARENTENA = 1; // ja na 1a falha entra em cooldown
const TIMEOUT_GATEWAY_MS = 15_000; // 15s por gateway antes de partir pro proximo

type EstadoCooldown = { ate: number; falhas: number };
const cooldown = new Map<GatewayId, EstadoCooldown>();

function gatewayEmCooldown(g: GatewayId): boolean {
  const c = cooldown.get(g);
  if (!c) return false;
  if (c.ate <= Date.now()) {
    cooldown.delete(g);
    return false;
  }
  return c.falhas >= FALHAS_PRA_QUARENTENA;
}

function registrarFalhaGateway(g: GatewayId, motivo: string) {
  const atual = cooldown.get(g);
  const falhas = (atual?.falhas ?? 0) + 1;
  cooldown.set(g, { ate: Date.now() + COOLDOWN_MS, falhas });
  console.warn(
    `[gateway/circuit-breaker] ${g} em cooldown por ${COOLDOWN_MS / 1000}s (falha #${falhas}): ${motivo}`,
  );
  // persiste no banco pro admin debugar (fire-and-forget)
  void registrarResultadoNoBanco(g, {
    sucesso: false,
    motivo: motivo.slice(0, 500),
    timestamp: new Date().toISOString(),
    falhas,
  });
}

function registrarSucessoGateway(g: GatewayId) {
  if (cooldown.has(g)) {
    console.log(`[gateway/circuit-breaker] ${g} se recuperou — saindo de cooldown`);
    cooldown.delete(g);
  }
  void registrarResultadoNoBanco(g, {
    sucesso: true,
    timestamp: new Date().toISOString(),
  });
}

// =====================================================================
// Persistencia do ultimo resultado de cada gateway
//
// Em memoria o cooldown eh por-instancia (cada serverless tem o seu mapa),
// entao a UI do admin nao consegue ver o estado real. A solucao eh tambem
// persistir o ultimo resultado em app_config — assim o admin enxerga "ok ha
// 2min" ou "erro: X" independente da instancia.
//
// Chave: `gateway_status_last:<gatewayId>`
// Valor: { sucesso, motivo?, timestamp, falhas? } ou { resetado: true, ... }
// =====================================================================

type ResultadoGateway = {
  sucesso?: boolean;
  motivo?: string;
  timestamp?: string;
  falhas?: number;
  resetado?: boolean;
  atualizadoPor?: string;
};

function chaveStatusGateway(g: GatewayId): string {
  return `gateway_status_last:${g}`;
}

async function registrarResultadoNoBanco(g: GatewayId, dados: ResultadoGateway) {
  try {
    const sb = createSupabaseAdmin();
    await sb.from("app_config").upsert(
      {
        chave: chaveStatusGateway(g),
        valor: { ...dados, gateway: g },
        atualizado_por: dados.atualizadoPor ?? null,
      },
      { onConflict: "chave" },
    );
  } catch (e) {
    console.error(`[gateway/status] falha ao persistir status de ${g}`, e);
  }
}

export type StatusUltimoGateway = {
  gateway: GatewayId;
  sucesso: boolean | null; // null = nunca tentou (ou foi resetado)
  motivo: string | null;
  timestampMs: number | null;
  resetado: boolean;
};

/** Le do banco o ultimo resultado de cada gateway (pra admin debugar). */
export async function lerStatusUltimoGateways(): Promise<StatusUltimoGateway[]> {
  try {
    const sb = createSupabaseAdmin();
    const chaves = GATEWAY_IDS.map((g) => chaveStatusGateway(g));
    const { data } = await sb
      .from("app_config")
      .select("chave, valor")
      .in("chave", chaves);
    const mapa = new Map<string, ResultadoGateway>(
      (data ?? []).map((r) => [r.chave as string, (r.valor ?? {}) as ResultadoGateway]),
    );
    return GATEWAY_IDS.map((g) => {
      const v = mapa.get(chaveStatusGateway(g));
      return {
        gateway: g,
        sucesso: v?.resetado ? null : v?.sucesso ?? null,
        motivo: v?.motivo ?? null,
        timestampMs: v?.timestamp ? Date.parse(v.timestamp) : null,
        resetado: v?.resetado ?? false,
      } satisfies StatusUltimoGateway;
    });
  } catch (e) {
    console.error("[gateway/status] falha ao ler status", e);
    return GATEWAY_IDS.map((g) => ({
      gateway: g,
      sucesso: null,
      motivo: null,
      timestampMs: null,
      resetado: false,
    }));
  }
}

/** Limpa o cooldown em memoria de um gateway especifico (so essa instancia). */
export function limparCooldownGateway(g: GatewayId) {
  cooldown.delete(g);
  void registrarResultadoNoBanco(g, { resetado: true });
}

/**
 * Tenta gerar um PIX de teste APENAS no gateway especificado, SEM failover.
 * Usado pelo painel admin pra debugar gateways que estao caindo. Registra o
 * resultado (sucesso/falha) no banco como qualquer outra tentativa.
 */
export async function testarApenasGateway(
  gateway: GatewayId,
  input: CriarPixUnificadoInput,
): Promise<{ ok: true; resposta: CriarPixUnificadoResposta; durMs: number } | { ok: false; erro: string; durMs: number }> {
  const t0 = Date.now();
  try {
    const resposta = await comTimeout(
      tentarPixNoGateway(gateway, input),
      TIMEOUT_GATEWAY_MS,
      `gateway ${gateway} (teste)`,
    );
    const dur = Date.now() - t0;
    registrarSucessoGateway(gateway);
    return {
      ok: true,
      resposta: { ...resposta, tentativas: [{ gateway, sucesso: true, duracaoMs: dur }] },
      durMs: dur,
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const dur = Date.now() - t0;
    registrarFalhaGateway(gateway, err.message);
    return { ok: false, erro: err.message, durMs: dur };
  }
}

/**
 * Monta a fila de tentativas. O gateway "preferido" (escolhido pelo admin)
 * vai sempre primeiro; depois entram os outros respeitando a prioridade
 * canonica. Gateways em cooldown vao pro fim da fila — eles ainda sao
 * tentaveis no caso de todos os outros falharem (melhor um delay maior do
 * que retornar erro pro cliente).
 */
function montarFilaFailover(preferido: GatewayId): GatewayId[] {
  const todos: GatewayId[] = [preferido];
  for (const g of PRIORIDADE_FAILOVER) {
    if (!todos.includes(g)) todos.push(g);
  }
  const saudaveis = todos.filter((g) => !gatewayEmCooldown(g));
  const cooldowned = todos.filter((g) => gatewayEmCooldown(g));
  return [...saudaveis, ...cooldowned];
}

/** Roda uma promise com timeout — se estourar, rejeita pra deixar o failover continuar. */
function comTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timeout apos ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
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
  /**
   * URL do callback (webhook). Opcional — se nao for passada, o gateway monta
   * a URL certa pra cada provedor (cada um tem seu endpoint proprio com body
   * diferente). Quando informada, ignora o helper e usa essa URL fixa.
   */
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
};

export type TentativaGateway = {
  gateway: GatewayId;
  sucesso: boolean;
  erro?: string;
  duracaoMs: number;
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
  /**
   * Tentativas feitas (em ordem). Em caso de failover, vem todos os gateways
   * que foram tentados antes de dar certo. O caller pode logar isso pra ter
   * visibilidade do quanto cada gateway esta caindo.
   */
  tentativas: TentativaGateway[];
};

/**
 * Faz uma unica tentativa contra um gateway especifico. Centraliza a
 * conversao do input unificado pro formato esperado por cada cliente.
 */
async function tentarPixNoGateway(
  gateway: GatewayId,
  input: CriarPixUnificadoInput,
): Promise<Omit<CriarPixUnificadoResposta, "tentativas">> {
  const callbackUrl = input.callbackUrl ?? webhookUrlParaGateway(gateway);

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
      callbackUrl,
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
      postbackUrl: callbackUrl,
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

  if (gateway === "playpayments") {
    // Play Payments — qrcode em texto (pix_code copia-e-cola). O webhook NAO
    // eh configurado por request: eh global, no painel deles (Configuracoes ->
    // Webhooks). O external_id = pedido.numero volta no payload do webhook.
    const r = await pp.criarCobrancaPix({
      identifier: input.identifier,
      amount: input.amount,
      client: input.client,
      items: input.itens.map((i) => ({
        title: i.nome,
        quantity: i.quantidade,
        price: i.precoUnitario,
      })),
      title: `Pedido ${input.identifier}`,
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
      orderUrl: null,
      receiptUrl: null,
    };
  }

  if (gateway === "hyzepay") {
    // HyzePay — qrcode em texto, sem URL "segura" propria
    const r = await hz.criarCobrancaPix({
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
      postbackUrl: callbackUrl,
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
      orderUrl: null,
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
    postbackUrl: callbackUrl,
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

/**
 * Cria uma cobranca PIX. Se `gatewayForcado` for passado, ele eh o ponto de
 * partida; senao, usa o gateway ativo no momento.
 *
 * Em caso de falha no gateway escolhido, tenta automaticamente os outros na
 * ordem de prioridade ate algum dar certo. Se TODOS falharem, lanca erro.
 */
export async function criarCobrancaPix(
  input: CriarPixUnificadoInput,
  gatewayForcado?: GatewayId,
): Promise<CriarPixUnificadoResposta> {
  const preferido = gatewayForcado ?? (await obterGatewayAtivo());
  const fila = montarFilaFailover(preferido);
  const tentativas: TentativaGateway[] = [];
  let ultimoErro: Error | null = null;

  for (let i = 0; i < fila.length; i++) {
    const gateway = fila[i];
    const inicio = Date.now();
    try {
      const resposta = await comTimeout(
        tentarPixNoGateway(gateway, input),
        TIMEOUT_GATEWAY_MS,
        `gateway ${gateway}`,
      );
      const duracao = Date.now() - inicio;
      tentativas.push({ gateway, sucesso: true, duracaoMs: duracao });
      registrarSucessoGateway(gateway);

      if (i > 0) {
        // Failover funcionou — log explicito pra rastrear no Vercel
        console.warn(
          `[gateway/failover] OK pedido=${input.identifier} preferido=${preferido} usado=${gateway} tentativas=${tentativas
            .map((t) => `${t.gateway}:${t.sucesso ? "ok" : "fail"}`)
            .join(",")}`,
        );
      }

      return { ...resposta, tentativas };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const duracao = Date.now() - inicio;
      tentativas.push({ gateway, sucesso: false, erro: err.message, duracaoMs: duracao });
      registrarFalhaGateway(gateway, err.message);
      ultimoErro = err;
      console.error(
        `[gateway/failover] ${gateway} falhou (pedido=${input.identifier}, ${duracao}ms): ${err.message}`,
      );
      // continua pro proximo gateway
    }
  }

  const detalhes = tentativas
    .map((t) => `${t.gateway}: ${t.erro ?? "ok"}`)
    .join(" | ");
  throw new Error(
    `Todos os gateways de pagamento falharam. ${detalhes}. Ultimo erro: ${ultimoErro?.message ?? "desconhecido"}`,
  );
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

  if (gateway === "hyzepay") {
    if (!pedido.gateway_id) return null;
    const t = await hz.consultarTransacaoPorId(pedido.gateway_id);
    if (!t?.status) return null;
    return {
      gatewayStatus: t.status,
      statusInterno: hz.mapearStatusPedido(t.status),
      transactionId: String(t.id),
    };
  }

  if (gateway === "playpayments") {
    if (!pedido.gateway_id) return null;
    const t = await pp.consultarTransacaoPorId(pedido.gateway_id);
    if (!t?.status) return null;
    return {
      gatewayStatus: t.status,
      statusInterno: pp.mapearStatusPedido(t.status),
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
  if (gateway === "hyzepay") return hz.mapearStatusPedido(statusCrua);
  if (gateway === "playpayments") return pp.mapearStatusPedido(statusCrua);
  return cp.mapearStatusPedido(statusCrua);
}

// =====================================================================
// Diagnostico — usado pelo painel admin pra mostrar gateways em cooldown
// =====================================================================

export type StatusGateway = {
  gateway: GatewayId;
  emCooldown: boolean;
  cooldownAteMs: number | null;
  falhasRecentes: number;
};

export function obterStatusFailover(): StatusGateway[] {
  const agora = Date.now();
  return PRIORIDADE_FAILOVER.map((g) => {
    const c = cooldown.get(g);
    const ativo = !!c && c.ate > agora;
    return {
      gateway: g,
      emCooldown: ativo && (c?.falhas ?? 0) >= FALHAS_PRA_QUARENTENA,
      cooldownAteMs: ativo ? c!.ate : null,
      falhasRecentes: ativo ? c!.falhas : 0,
    };
  });
}
