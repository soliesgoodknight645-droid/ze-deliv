import Link from "next/link";
import {
  BarChart3,
  CreditCard,
  Gauge,
  LayoutGrid,
  MousePointerClick,
  Package,
  Search,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { diaIsoBR, fmtPreco, fmtTelefone } from "@/lib/utils";
import { DashboardClient, type LinhaPedidoDashboard, type Ranking } from "./dashboard-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Atribuição — Zé Chegou 24h", robots: { index: false } };

type StatusFiltro = "todos" | "leads" | "pagos" | "cancelados" | "criados";

type SearchParamsAtrib = {
  de?: string;
  ate?: string;
  status?: StatusFiltro;
  source?: string;
  medium?: string;
  campaign?: string;
  q?: string;
};

const STATUS_OPCOES: { id: StatusFiltro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "leads", label: "Leads (qualquer status)" },
  { id: "criados", label: "Pedidos criados" },
  { id: "pagos", label: "Pedidos pagos" },
  { id: "cancelados", label: "Cancelados" },
];

const PERIODOS_RAPIDOS: { id: string; label: string; dias: number }[] = [
  { id: "7", label: "7 dias", dias: 7 },
  { id: "30", label: "30 dias", dias: 30 },
  { id: "90", label: "90 dias", dias: 90 },
];

const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
  aguardando_pagamento: { texto: "Aguardando", cor: "bg-yellow-100 text-yellow-700" },
  pago: { texto: "Pago", cor: "bg-green-100 text-green-700" },
  em_separacao: { texto: "Separação", cor: "bg-blue-100 text-blue-700" },
  em_entrega: { texto: "Entrega", cor: "bg-orange-100 text-orange-700" },
  concluido: { texto: "Concluído", cor: "bg-gray-200 text-gray-700" },
  cancelado: { texto: "Cancelado", cor: "bg-red-100 text-red-700" },
};

function dataIsoMenosDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function rotuloOuOrganic(v: string | null | undefined): string {
  if (!v || !v.trim()) return "(orgânico/direto)";
  return v;
}

// Pago "real" = status pago e nao foi marcado manualmente pelo admin.
// `gateway_status = 'ADMIN_MARCADO_PAGO'` é setado pelo botão "Marcar como pago"
// no detalhe do pedido — esses só servem pra furar o funil em testes
// e nao devem inflar os numeros do dashboard.
const STATUS_PAGOS_SET = new Set(["pago", "em_separacao", "em_entrega", "concluido"]);
function ehPagoReal(p: { status: string; gateway_status?: string | null }): boolean {
  if (!STATUS_PAGOS_SET.has(p.status)) return false;
  if (p.gateway_status === "ADMIN_MARCADO_PAGO") return false;
  return true;
}

function rankear(
  pedidos: PedidoComItens[],
  campo: keyof Pick<
    PedidoBase,
    "traffic_source" | "traffic_medium" | "traffic_campaign" | "traffic_adgroup" | "traffic_keyword" | "traffic_searchterm" | "traffic_device"
  >,
  comb?: boolean,
): Ranking[] {
  const mapa = new Map<string, Ranking>();
  for (const p of pedidos) {
    const v = comb
      ? `${rotuloOuOrganic(p.traffic_source as string | null)} / ${rotuloOuOrganic(p.traffic_medium as string | null)}`
      : rotuloOuOrganic(p[campo] as string | null);
    const total = Number(p.total ?? 0);
    const pago = ehPagoReal(p);
    if (!mapa.has(v)) {
      mapa.set(v, { chave: v, leads: 0, pedidos: 0, faturamento: 0 });
    }
    const r = mapa.get(v)!;
    r.leads += 1;
    if (pago) {
      r.pedidos += 1;
      r.faturamento += total;
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.faturamento - a.faturamento || b.leads - a.leads);
}

type PedidoBase = {
  id: string;
  numero: string;
  status: string;
  total: number | string;
  cliente_nome: string;
  cliente_telefone: string;
  criado_em: string;
  paid_at: string | null;
  gateway_status: string | null;
  traffic_source: string | null;
  traffic_medium: string | null;
  traffic_campaign: string | null;
  traffic_adgroup: string | null;
  traffic_keyword: string | null;
  traffic_searchterm: string | null;
  traffic_matchtype: string | null;
  traffic_device: string | null;
  traffic_creative: string | null;
  traffic_gclid: string | null;
  traffic_landing_page: string | null;
  traffic_referrer: string | null;
  first_visit_at: string | null;
  conversion_at: string | null;
};

type ItemDoPedido = {
  produto_nome: string;
  produto_slug: string;
  quantidade: number;
  preco_unitario: number | string;
  produto_id: string;
};

type PedidoComItens = PedidoBase & {
  itens_pedido: ItemDoPedido[] | null;
};

export default async function DashboardAtribuicaoPage({
  searchParams,
}: {
  searchParams?: SearchParamsAtrib;
}) {
  const admin = createSupabaseAdmin();

  const hojeIso = new Date().toISOString();
  const de = searchParams?.de ?? dataIsoMenosDias(30).slice(0, 10);
  const ate = searchParams?.ate ?? hojeIso.slice(0, 10);
  const status = (searchParams?.status as StatusFiltro) ?? "todos";
  const sourceF = searchParams?.source?.trim() ?? "";
  const mediumF = searchParams?.medium?.trim() ?? "";
  const campaignF = searchParams?.campaign?.trim() ?? "";
  const q = searchParams?.q?.trim() ?? "";

  const deDate = new Date(`${de}T00:00:00.000-03:00`);
  const ateDate = new Date(`${ate}T23:59:59.999-03:00`);

  let query = admin
    .from("pedidos")
    .select(
      `id, numero, status, total, cliente_nome, cliente_telefone, criado_em, paid_at,
       gateway_status,
       traffic_source, traffic_medium, traffic_campaign, traffic_adgroup,
       traffic_keyword, traffic_searchterm, traffic_matchtype, traffic_device,
       traffic_creative, traffic_gclid, traffic_landing_page, traffic_referrer,
       first_visit_at, conversion_at,
       itens_pedido(produto_nome, produto_slug, quantidade, preco_unitario, produto_id)`,
    )
    .gte("criado_em", deDate.toISOString())
    .lte("criado_em", ateDate.toISOString())
    .order("criado_em", { ascending: false })
    .limit(2000);

  if (status === "pagos") query = query.in("status", ["pago", "em_separacao", "em_entrega", "concluido"]);
  if (status === "cancelados") query = query.eq("status", "cancelado");
  if (status === "criados") query = query.neq("status", "cancelado");
  if (status === "leads") {
    /* todos com algum dado de atribuição */
  }

  if (sourceF) query = query.ilike("traffic_source", `%${sourceF}%`);
  if (mediumF) query = query.ilike("traffic_medium", `%${mediumF}%`);
  if (campaignF) query = query.ilike("traffic_campaign", `%${campaignF}%`);
  if (q) {
    query = query.or(
      `numero.ilike.%${q}%,cliente_nome.ilike.%${q}%,cliente_telefone.ilike.%${q}%,traffic_keyword.ilike.%${q}%,traffic_searchterm.ilike.%${q}%`,
    );
  }

  // Nao da pra fazer join Postgrest itens_pedido -> produtos porque produto_id
  // em itens_pedido e text (sem FK formal). Usamos `produto_slug` para mapear,
  // ja que slug e unique em produtos.
  const [{ data: pedidosRaw, error }, { data: catsList }, { data: produtosList }] =
    await Promise.all([
      query,
      admin.from("categorias").select("id, nome").order("ordem", { ascending: true }),
      admin.from("produtos").select("slug, categoria_id"),
    ]);
  const pedidos = (pedidosRaw ?? []) as unknown as PedidoComItens[];
  const catNomePorId = new Map((catsList ?? []).map((c) => [c.id as string, c.nome as string]));
  const slugParaCat = new Map(
    (produtosList ?? []).map((p) => [p.slug as string, p.categoria_id as string]),
  );

  // ===== KPIs =====
  const totalLeads = pedidos.length;
  const pagos = pedidos.filter(ehPagoReal);
  const totalPagos = pagos.length;
  const faturamento = pagos.reduce((s, p) => s + Number(p.total ?? 0), 0);
  const ticketMedio = totalPagos > 0 ? faturamento / totalPagos : 0;
  const taxaConversao = totalLeads > 0 ? (totalPagos / totalLeads) * 100 : 0;
  const totalManuais = pedidos.filter(
    (p) => STATUS_PAGOS_SET.has(p.status) && p.gateway_status === "ADMIN_MARCADO_PAGO",
  ).length;

  // ===== Rankings =====
  const rankCampanha = rankear(pedidos, "traffic_campaign").slice(0, 15);
  const rankAdgroup = rankear(pedidos, "traffic_adgroup").slice(0, 15);
  const rankKeyword = rankear(pedidos, "traffic_keyword").slice(0, 15);
  const rankSearchterm = rankear(pedidos, "traffic_searchterm").slice(0, 15);
  const rankSourceMedium = rankear(pedidos, "traffic_source", true).slice(0, 15);
  const rankDevice = rankear(pedidos, "traffic_device").slice(0, 10);

  // ===== Faturamento por categoria e top produtos (apenas pagos) =====
  // Cruza com os mesmos filtros do dashboard — mostra qual categoria/produto
  // está vendendo dentro do período/origem selecionado.
  const fatPorCategoria = new Map<string, { leads: number; pedidos: number; faturamento: number }>();
  const topProdutos = new Map<
    string,
    { nome: string; quantidade: number; faturamento: number; pedidos: number }
  >();
  const idsPedidoPagosPorCat = new Map<string, Set<string>>();
  const idsPedidoPagosPorProd = new Map<string, Set<string>>();

  for (const p of pagos) {
    const itens = p.itens_pedido ?? [];
    const idsCatNoPedido = new Set<string>();
    const idsProdNoPedido = new Set<string>();
    for (const it of itens) {
      const catId = slugParaCat.get(it.produto_slug) ?? "sem_categoria";
      const valor = Number(it.preco_unitario) * Number(it.quantidade);

      if (!fatPorCategoria.has(catId)) {
        fatPorCategoria.set(catId, { leads: 0, pedidos: 0, faturamento: 0 });
      }
      fatPorCategoria.get(catId)!.faturamento += valor;
      idsCatNoPedido.add(catId);

      const chaveProd = `${it.produto_id}::${it.produto_nome}`;
      if (!topProdutos.has(chaveProd)) {
        topProdutos.set(chaveProd, {
          nome: it.produto_nome,
          quantidade: 0,
          faturamento: 0,
          pedidos: 0,
        });
      }
      const linha = topProdutos.get(chaveProd)!;
      linha.quantidade += Number(it.quantidade);
      linha.faturamento += valor;
      idsProdNoPedido.add(chaveProd);
    }
    // contagem de "pedidos distintos" por categoria/produto (não item)
    idsCatNoPedido.forEach((catId) => {
      if (!idsPedidoPagosPorCat.has(catId)) idsPedidoPagosPorCat.set(catId, new Set());
      idsPedidoPagosPorCat.get(catId)!.add(p.id);
    });
    idsProdNoPedido.forEach((k) => {
      if (!idsPedidoPagosPorProd.has(k)) idsPedidoPagosPorProd.set(k, new Set());
      idsPedidoPagosPorProd.get(k)!.add(p.id);
    });
  }

  fatPorCategoria.forEach((agg, catId) => {
    agg.pedidos = idsPedidoPagosPorCat.get(catId)?.size ?? 0;
    agg.leads = agg.pedidos; // só pagos entram nessa visão
  });
  topProdutos.forEach((agg, k) => {
    agg.pedidos = idsPedidoPagosPorProd.get(k)?.size ?? 0;
  });

  const rankCategoria: Ranking[] = Array.from(fatPorCategoria.entries())
    .map(([catId, agg]) => ({
      chave: catNomePorId.get(catId) ?? "Sem categoria",
      leads: agg.leads,
      pedidos: agg.pedidos,
      faturamento: agg.faturamento,
    }))
    .sort((a, b) => b.faturamento - a.faturamento || b.pedidos - a.pedidos)
    .slice(0, 15);

  const rankProdutos = Array.from(topProdutos.values())
    .sort((a, b) => b.faturamento - a.faturamento || b.quantidade - a.quantidade)
    .slice(0, 15);
  const totalFatProdutos = rankProdutos.reduce((s, r) => s + r.faturamento, 0);

  // ===== Faturamento por dia (gráfico) — agrupando no fuso de São Paulo =====
  // Antes pegavamos `criado_em.slice(0, 10)` (UTC), o que jogava pedidos
  // feitos a noite (BR) pro dia seguinte. Agora normalizamos pelo fuso BR.
  type Dia = { data: string; leads: number; pagos: number; faturamento: number };
  const porDia = new Map<string, Dia>();
  const totalDias = Math.max(
    1,
    Math.ceil((ateDate.getTime() - deDate.getTime()) / (24 * 60 * 60 * 1000)),
  );
  for (let i = 0; i <= totalDias; i++) {
    const d = new Date(deDate);
    d.setDate(d.getDate() + i);
    const k = diaIsoBR(d);
    if (!porDia.has(k)) porDia.set(k, { data: k, leads: 0, pagos: 0, faturamento: 0 });
  }
  for (const p of pedidos) {
    const k = diaIsoBR(p.criado_em as string);
    if (!porDia.has(k)) {
      porDia.set(k, { data: k, leads: 0, pagos: 0, faturamento: 0 });
    }
    const dia = porDia.get(k)!;
    dia.leads += 1;
    if (ehPagoReal(p)) {
      dia.pagos += 1;
      dia.faturamento += Number(p.total ?? 0);
    }
  }
  const seriePorDia = Array.from(porDia.values()).sort((a, b) =>
    a.data.localeCompare(b.data),
  );

  // ===== Linhas para a tabela detalhada =====
  const linhas: LinhaPedidoDashboard[] = pedidos.map((p) => {
    const itens = p.itens_pedido ?? [];
    const produto =
      itens.length === 0
        ? "—"
        : itens.length === 1
          ? `${itens[0].quantidade}× ${itens[0].produto_nome}`
          : `${itens[0].quantidade}× ${itens[0].produto_nome} (+${itens.length - 1})`;
    const meta = STATUS_LABEL[p.status] ?? { texto: p.status, cor: "bg-gray-100 text-gray-700" };
    const manualPago = p.gateway_status === "ADMIN_MARCADO_PAGO";
    return {
      id: p.id,
      numero: p.numero,
      cliente: p.cliente_nome,
      telefone: fmtTelefone(p.cliente_telefone),
      produto,
      total: Number(p.total ?? 0),
      status: p.status,
      statusLabel: manualPago ? `${meta.texto} (manual)` : meta.texto,
      statusCor: manualPago ? "bg-gray-200 text-gray-700" : meta.cor,
      manualPago,
      criadoEm: p.criado_em,
      paidAt: p.paid_at,
      source: p.traffic_source,
      medium: p.traffic_medium,
      campaign: p.traffic_campaign,
      adgroup: p.traffic_adgroup,
      keyword: p.traffic_keyword,
      searchterm: p.traffic_searchterm,
      matchtype: p.traffic_matchtype,
      device: p.traffic_device,
      gclid: p.traffic_gclid,
      firstVisitAt: p.first_visit_at,
    };
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-extrabold text-2xl text-brand-dark inline-flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-yellow" />
            Dashboard de Atribuição
          </h1>
          <p className="text-sm text-gray-500">
            Rastreamento nativo de tráfego pago e orgânico — first-click attribution.
          </p>
        </div>
      </div>

      {/* ===== Filtros ===== */}
      <form
        action="/admin/atribuicao"
        method="get"
        className="bg-white rounded-2xl p-4 mb-5 shadow-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        <Campo rotulo="De">
          <input
            type="date"
            name="de"
            defaultValue={de}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
          />
        </Campo>
        <Campo rotulo="Até">
          <input
            type="date"
            name="ate"
            defaultValue={ate}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
          />
        </Campo>
        <Campo rotulo="Status">
          <select
            name="status"
            defaultValue={status}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
          >
            {STATUS_OPCOES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Source">
          <input
            name="source"
            defaultValue={sourceF}
            placeholder="google, facebook…"
            className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
          />
        </Campo>
        <Campo rotulo="Medium">
          <input
            name="medium"
            defaultValue={mediumF}
            placeholder="cpc, organic…"
            className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
          />
        </Campo>
        <Campo rotulo="Campanha">
          <input
            name="campaign"
            defaultValue={campaignF}
            placeholder="ex: Cervejas-SP"
            className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
          />
        </Campo>
        <Campo rotulo="Buscar (cliente, telefone, palavra-chave, número)" full>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar…"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            />
          </div>
        </Campo>
        <div className="col-span-2 sm:col-span-3 lg:col-span-6 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-400">Período:</span>
            {PERIODOS_RAPIDOS.map((p) => (
              <Link
                key={p.id}
                href={`/admin/atribuicao?de=${dataIsoMenosDias(p.dias).slice(0, 10)}&ate=${hojeIso.slice(0, 10)}${status !== "todos" ? `&status=${status}` : ""}`}
                className="px-2.5 h-7 rounded-full font-bold inline-flex items-center bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                {p.label}
              </Link>
            ))}
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/atribuicao"
              className="h-10 px-4 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 inline-flex items-center"
            >
              Limpar
            </Link>
            <button
              type="submit"
              className="h-10 px-5 rounded-lg text-xs font-bold bg-brand-yellow text-brand-dark active:scale-95 inline-flex items-center"
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm mb-4">
          Erro ao carregar dados: {error.message}
        </div>
      )}

      {totalManuais > 0 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 text-xs mb-4 flex items-start gap-2">
          <span className="font-bold">ℹ</span>
          <span>
            <strong>{totalManuais}</strong>{" "}
            pedido{totalManuais === 1 ? "" : "s"} marcado{totalManuais === 1 ? "" : "s"} como pago
            manualmente pelo admin {totalManuais === 1 ? "foi excluído" : "foram excluídos"} dos KPIs,
            rankings, gráficos e do faturamento por categoria — eles aparecem na tabela detalhada
            com o badge <em>“(manual)”</em>.
          </span>
        </div>
      )}

      {/* ===== KPIs ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Kpi
          rotulo="Total de leads"
          valor={totalLeads.toLocaleString("pt-BR")}
          Icon={Users}
          accent="bg-blue-100 text-blue-700"
        />
        <Kpi
          rotulo="Pedidos pagos"
          valor={totalPagos.toLocaleString("pt-BR")}
          Icon={ShoppingBag}
          accent="bg-green-100 text-green-700"
        />
        <Kpi
          rotulo="Faturamento"
          valor={fmtPreco(faturamento)}
          Icon={CreditCard}
          accent="bg-yellow-100 text-yellow-700"
        />
        <Kpi
          rotulo="Ticket médio"
          valor={fmtPreco(ticketMedio)}
          Icon={TrendingUp}
          accent="bg-purple-100 text-purple-700"
        />
        <Kpi
          rotulo="Conversão"
          valor={`${taxaConversao.toFixed(1)}%`}
          Icon={Gauge}
          accent="bg-orange-100 text-orange-700"
        />
      </div>

      {/* ===== Gráfico + Source/Medium ===== */}
      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-2xl p-5 shadow-sm lg:col-span-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 inline-flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Faturamento e leads por dia
          </h3>
          <DashboardClient kind="grafico" serie={seriePorDia} />
        </div>
        <RankingCard titulo="Source / Medium" rankings={rankSourceMedium} Icon={MousePointerClick} />
      </div>

      {/* ===== O que está vendendo (categoria + produtos) ===== */}
      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        <RankingCard
          titulo="Faturamento por categoria"
          rankings={rankCategoria}
          Icon={LayoutGrid}
          subtitulo="Apenas pedidos pagos"
        />
        <ProdutosCard rankings={rankProdutos} totalFat={totalFatProdutos} />
      </div>

      {/* ===== Rankings de atribuição ===== */}
      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        <RankingCard titulo="Campanhas" rankings={rankCampanha} Icon={MousePointerClick} />
        <RankingCard titulo="Grupos de anúncios" rankings={rankAdgroup} Icon={MousePointerClick} />
        <RankingCard titulo="Palavras-chave" rankings={rankKeyword} Icon={MousePointerClick} />
        <RankingCard titulo="Termos pesquisados pelo usuário" rankings={rankSearchterm} Icon={Search} />
        <RankingCard titulo="Dispositivo" rankings={rankDevice} Icon={MousePointerClick} />
      </div>

      {/* ===== Tabela detalhada (client com sort) ===== */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Pedidos detalhados
          </h3>
          <span className="text-xs text-gray-400">
            {linhas.length.toLocaleString("pt-BR")} registro{linhas.length === 1 ? "" : "s"}
          </span>
        </div>
        <DashboardClient kind="tabela" linhas={linhas} />
      </div>
    </div>
  );
}

function Campo({ rotulo, full, children }: { rotulo: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "col-span-2 sm:col-span-3 lg:col-span-6" : ""}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{rotulo}</span>
      {children}
    </label>
  );
}

function Kpi({
  rotulo,
  valor,
  Icon,
  accent,
}: {
  rotulo: string;
  valor: string;
  Icon: typeof Users;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-xl inline-flex items-center justify-center mb-2 ${accent}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{rotulo}</p>
      <p className="text-xl font-extrabold text-brand-dark mt-0.5">{valor}</p>
    </div>
  );
}

function RankingCard({
  titulo,
  rankings,
  Icon,
  subtitulo,
}: {
  titulo: string;
  rankings: Ranking[];
  Icon: typeof Users;
  subtitulo?: string;
}) {
  const max = rankings[0]?.faturamento ?? 0;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider inline-flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" /> {titulo}
        </h3>
        {subtitulo && <span className="text-[10px] text-gray-400">{subtitulo}</span>}
      </div>
      {rankings.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sem dados no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {rankings.map((r) => {
            const pct = max > 0 ? (r.faturamento / max) * 100 : 0;
            return (
              <li key={r.chave}>
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <span className="font-semibold text-brand-dark truncate flex-1" title={r.chave}>
                    {r.chave}
                  </span>
                  <span className="text-gray-500 flex-shrink-0">
                    {r.pedidos} ped · {r.leads} leads
                  </span>
                  <span className="font-extrabold text-brand-dark flex-shrink-0 min-w-[80px] text-right">
                    {fmtPreco(r.faturamento)}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-yellow rounded-full"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProdutosCard({
  rankings,
  totalFat,
}: {
  rankings: Array<{ nome: string; quantidade: number; faturamento: number; pedidos: number }>;
  totalFat: number;
}) {
  const max = rankings[0]?.faturamento ?? 0;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider inline-flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5" /> Produtos mais vendidos
        </h3>
        {totalFat > 0 && (
          <span className="text-[10px] text-gray-400">Top 15 · pagos</span>
        )}
      </div>
      {rankings.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sem dados no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {rankings.map((r) => {
            const pct = max > 0 ? (r.faturamento / max) * 100 : 0;
            return (
              <li key={r.nome}>
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <span className="font-semibold text-brand-dark truncate flex-1" title={r.nome}>
                    {r.nome}
                  </span>
                  <span className="text-gray-500 flex-shrink-0">
                    {r.quantidade} un · {r.pedidos} ped
                  </span>
                  <span className="font-extrabold text-brand-dark flex-shrink-0 min-w-[80px] text-right">
                    {fmtPreco(r.faturamento)}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-yellow rounded-full"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
