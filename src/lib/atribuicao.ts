// =====================================================================
// Captura e persistência de atribuição de tráfego (UTMs + GCLID).
//
// Estratégia: FIRST CLICK ATTRIBUTION.
//   - Na PRIMEIRA visita gravamos os parâmetros da URL em cookie + localStorage.
//   - Em visitas/navegações subsequentes NÃO sobrescrevemos os dados originais.
//   - Validade mínima: 90 dias.
//   - Toda action server-side de criação de lead/pedido lê esses dados via
//     `lerAtribuicaoCliente()` e os anexa ao registro.
// =====================================================================

export const COOKIE_ATRIBUICAO = "ze_atrib";
export const STORAGE_ATRIBUICAO = "ze:atribuicao:v1";
export const DIAS_VALIDADE = 90;

export type Atribuicao = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  adgroup: string | null;
  keyword: string | null;
  searchterm: string | null;
  matchtype: string | null;
  device: string | null;
  creative: string | null;
  gclid: string | null;
  landingPage: string | null;
  referrer: string | null;
  firstVisitAt: string | null;
};

export const ATRIBUICAO_VAZIA: Atribuicao = {
  source: null,
  medium: null,
  campaign: null,
  adgroup: null,
  keyword: null,
  searchterm: null,
  matchtype: null,
  device: null,
  creative: null,
  gclid: null,
  landingPage: null,
  referrer: null,
  firstVisitAt: null,
};

// Aceitamos múltiplos aliases comuns nos parâmetros de URL —
// é normal os anúncios mandarem "utm_term" como palavra-chave, "utm_content"
// como criativo e "utm_adgroup"/"utm_ad_group" para o grupo de anúncios.
const ALIASES: Record<keyof Atribuicao, string[]> = {
  source: ["utm_source"],
  medium: ["utm_medium"],
  campaign: ["utm_campaign", "utm_campaign_id", "campaignid"],
  adgroup: ["utm_adgroup", "utm_ad_group", "adgroupid", "utm_adgroupid"],
  keyword: ["utm_keyword", "utm_term", "keyword"],
  searchterm: ["utm_searchterm", "utm_search_term", "searchterm", "q"],
  matchtype: ["utm_matchtype", "utm_match_type", "matchtype"],
  device: ["utm_device", "device"],
  creative: ["utm_creative", "utm_content", "creative"],
  gclid: ["gclid"],
  landingPage: [],
  referrer: [],
  firstVisitAt: [],
};

function pegarParam(params: URLSearchParams, aliases: string[]): string | null {
  for (const a of aliases) {
    const v = params.get(a);
    if (v && v.trim()) return v.trim().slice(0, 255);
  }
  return null;
}

function detectarDeviceUA(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Mobile|Android|iPhone|iPod|IEMobile|BlackBerry/i.test(ua)) return "mobile";
  return "desktop";
}

function extrairDaUrl(url: string, referrer: string): Atribuicao {
  const u = new URL(url);
  const params = u.searchParams;
  const novo: Atribuicao = { ...ATRIBUICAO_VAZIA };

  (Object.keys(ALIASES) as (keyof Atribuicao)[]).forEach((k) => {
    const aliases = ALIASES[k];
    if (aliases.length > 0) {
      novo[k] = pegarParam(params, aliases) as Atribuicao[typeof k];
    }
  });

  // Se veio gclid mas o usuário não passou utm_source, assumimos google/cpc
  if (novo.gclid && !novo.source) novo.source = "google";
  if (novo.gclid && !novo.medium) novo.medium = "cpc";

  // Device do device-param tem prioridade. Senão tentamos detectar pelo UA.
  if (!novo.device) novo.device = detectarDeviceUA();

  novo.landingPage = u.pathname + (u.search ? u.search : "");
  novo.referrer = referrer && !referrer.includes(u.host) ? referrer.slice(0, 500) : null;
  novo.firstVisitAt = new Date().toISOString();

  return novo;
}

function temAlgumParam(a: Atribuicao): boolean {
  return Boolean(
    a.source || a.medium || a.campaign || a.adgroup || a.keyword ||
      a.searchterm || a.matchtype || a.creative || a.gclid,
  );
}

function escreverCookie(valor: string) {
  if (typeof document === "undefined") return;
  const maxAge = DIAS_VALIDADE * 24 * 60 * 60;
  const seguro = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_ATRIBUICAO}=${encodeURIComponent(valor)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${seguro}`;
}

function lerCookie(): Atribuicao | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(";").find((c) => c.trim().startsWith(`${COOKIE_ATRIBUICAO}=`));
  if (!match) return null;
  try {
    const raw = decodeURIComponent(match.split("=")[1]);
    return JSON.parse(raw) as Atribuicao;
  } catch {
    return null;
  }
}

function lerStorage(): Atribuicao | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_ATRIBUICAO);
    if (!raw) return null;
    return JSON.parse(raw) as Atribuicao;
  } catch {
    return null;
  }
}

function escreverStorage(a: Atribuicao) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_ATRIBUICAO, JSON.stringify(a));
  } catch {}
}

/**
 * Captura/atualiza atribuição. Roda uma vez por carregamento de página.
 * Mantém a regra de FIRST CLICK: se já existir atribuição salva, nunca
 * sobrescreve. Se a primeira visita não tinha UTMs e o usuário voltar
 * depois com UTMs, aí sim grava (era anônimo antes).
 */
export function capturarAtribuicao(): Atribuicao {
  if (typeof window === "undefined") return ATRIBUICAO_VAZIA;

  const existente = lerCookie() || lerStorage();
  const novoDaUrl = extrairDaUrl(window.location.href, document.referrer || "");

  // Se já temos atribuição com algum parâmetro real, mantém o original.
  if (existente && temAlgumParam(existente)) {
    // Apenas reescreve para renovar o Max-Age (rolling 90 dias).
    escreverCookie(JSON.stringify(existente));
    escreverStorage(existente);
    return existente;
  }

  // Não tinha nada (ou era visita anônima sem UTMs)
  // Se a URL atual tem ALGUM parâmetro de tráfego, grava.
  // Caso contrário, grava só o firstVisitAt + device + referrer (organic/direct).
  const paraGravar: Atribuicao = temAlgumParam(novoDaUrl)
    ? novoDaUrl
    : existente
      ? existente
      : {
          ...novoDaUrl,
          source: novoDaUrl.referrer ? "referral" : "direct",
          medium: novoDaUrl.referrer ? "referral" : "(none)",
        };

  escreverCookie(JSON.stringify(paraGravar));
  escreverStorage(paraGravar);
  return paraGravar;
}

/**
 * Lê a atribuição já gravada — usar antes de submeter forms/checkout.
 * Garante que a atribuição existe (chamando capturarAtribuicao) caso
 * ainda não tenha rodado naquela aba.
 */
export function lerAtribuicaoCliente(): Atribuicao {
  if (typeof window === "undefined") return ATRIBUICAO_VAZIA;
  const existente = lerCookie() || lerStorage();
  if (existente) return existente;
  return capturarAtribuicao();
}

/**
 * Converte para o payload que o backend persiste no pedido.
 * Mantém os nomes das colunas em snake_case que estão na tabela `pedidos`.
 */
export function atribuicaoParaPayload(a: Atribuicao) {
  return {
    traffic_source: a.source,
    traffic_medium: a.medium,
    traffic_campaign: a.campaign,
    traffic_adgroup: a.adgroup,
    traffic_keyword: a.keyword,
    traffic_searchterm: a.searchterm,
    traffic_matchtype: a.matchtype,
    traffic_device: a.device,
    traffic_creative: a.creative,
    traffic_gclid: a.gclid,
    traffic_landing_page: a.landingPage,
    traffic_referrer: a.referrer,
    first_visit_at: a.firstVisitAt,
  };
}
