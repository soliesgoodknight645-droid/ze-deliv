import Link from "next/link";
import {
  BarChart3,
  ChevronRight,
  CreditCard,
  Filter,
  LayoutGrid,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fmtPreco, fmtTelefone } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Pedidos — Zé Chegou 24h", robots: { index: false } };

const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
  aguardando_pagamento: { texto: "Aguardando pagamento", cor: "bg-yellow-100 text-yellow-700" },
  pago: { texto: "Pago", cor: "bg-green-100 text-green-700" },
  em_separacao: { texto: "Em separação", cor: "bg-blue-100 text-blue-700" },
  em_entrega: { texto: "Em entrega", cor: "bg-orange-100 text-orange-700" },
  concluido: { texto: "Concluído", cor: "bg-gray-200 text-gray-700" },
  cancelado: { texto: "Cancelado", cor: "bg-red-100 text-red-700" },
};

const STATUS_PAGOS = ["pago", "em_separacao", "em_entrega", "concluido"] as const;

type Filtro = "todos" | "aguardando" | "ativos" | "concluidos";

export default async function AdminPedidosPage({
  searchParams,
}: {
  searchParams?: { filtro?: string; q?: string };
}) {
  const filtro = (searchParams?.filtro ?? "ativos") as Filtro;
  const q = (searchParams?.q ?? "").trim();

  const admin = createSupabaseAdmin();
  let query = admin
    .from("pedidos")
    .select("id, numero, status, total, cliente_nome, cliente_telefone, criado_em")
    .order("criado_em", { ascending: false })
    .limit(100);

  if (filtro === "aguardando") query = query.eq("status", "aguardando_pagamento");
  if (filtro === "ativos") query = query.in("status", ["aguardando_pagamento", "pago", "em_separacao", "em_entrega"]);
  if (filtro === "concluidos") query = query.in("status", ["concluido", "cancelado"]);

  if (q) {
    query = query.or(`numero.ilike.%${q}%,cliente_nome.ilike.%${q}%,cliente_telefone.ilike.%${q}%`);
  }

  const { data: pedidos, error } = await query;

  // ===== Resumo dos últimos 30 dias (KPIs + faturamento por categoria) =====
  const desdeIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  const [{ data: pedidos30 }, { data: catList }] = await Promise.all([
    admin
      .from("pedidos")
      .select(
        `id, status, total, criado_em,
         itens_pedido(quantidade, preco_unitario, produto_id,
           produtos(categoria_id))`,
      )
      .gte("criado_em", desdeIso)
      .limit(2000),
    admin.from("categorias").select("id, nome").order("ordem", { ascending: true }),
  ]);

  const pedidos30arr = (pedidos30 ?? []) as Array<{
    id: string;
    status: string;
    total: number | string;
    criado_em: string;
    itens_pedido:
      | Array<{
          quantidade: number;
          preco_unitario: number | string;
          produto_id: string;
          produtos: { categoria_id: string } | { categoria_id: string }[] | null;
        }>
      | null;
  }>;

  const ehPago = (s: string) => (STATUS_PAGOS as readonly string[]).includes(s);

  const totalPagos30 = pedidos30arr.filter((p) => ehPago(p.status)).length;
  const faturamento30 = pedidos30arr
    .filter((p) => ehPago(p.status))
    .reduce((s, p) => s + Number(p.total ?? 0), 0);
  const ticketMedio30 = totalPagos30 > 0 ? faturamento30 / totalPagos30 : 0;

  const catNome = new Map((catList ?? []).map((c) => [c.id as string, c.nome as string]));
  const fatPorCategoria = new Map<string, number>();
  for (const p of pedidos30arr) {
    if (!ehPago(p.status)) continue;
    for (const it of p.itens_pedido ?? []) {
      const prod = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos;
      const catId = prod?.categoria_id ?? "sem_categoria";
      const valor = Number(it.preco_unitario) * Number(it.quantidade);
      fatPorCategoria.set(catId, (fatPorCategoria.get(catId) ?? 0) + valor);
    }
  }
  const rankCategorias = Array.from(fatPorCategoria.entries())
    .map(([catId, valor]) => ({
      catId,
      nome: catNome.get(catId) ?? "Sem categoria",
      valor,
    }))
    .sort((a, b) => b.valor - a.valor);
  const totalCategoria = rankCategorias.reduce((s, r) => s + r.valor, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-extrabold text-2xl text-brand-dark">Pedidos</h1>
          <p className="text-sm text-gray-500">Gerencie pagamentos e entregas em andamento.</p>
        </div>
        <Link
          href="/admin/atribuicao"
          className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold bg-brand-dark text-white hover:bg-black/80"
        >
          <BarChart3 className="w-3.5 h-3.5" /> Dashboard de atribuição
        </Link>
      </div>

      {/* ===== KPIs últimos 30 dias ===== */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiSimples
          rotulo="Pedidos pagos (30d)"
          valor={totalPagos30.toLocaleString("pt-BR")}
          Icon={ShoppingBag}
          accent="bg-green-100 text-green-700"
        />
        <KpiSimples
          rotulo="Faturamento (30d)"
          valor={fmtPreco(faturamento30)}
          Icon={CreditCard}
          accent="bg-yellow-100 text-yellow-700"
        />
        <KpiSimples
          rotulo="Ticket médio (30d)"
          valor={fmtPreco(ticketMedio30)}
          Icon={TrendingUp}
          accent="bg-purple-100 text-purple-700"
        />
      </div>

      {/* ===== Faturamento por categoria ===== */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider inline-flex items-center gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5" /> Faturamento por categoria · últimos 30 dias
          </h3>
          {totalCategoria > 0 && (
            <span className="text-xs text-gray-500">
              Total: <strong className="text-brand-dark">{fmtPreco(totalCategoria)}</strong>
            </span>
          )}
        </div>
        {rankCategorias.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Sem pedidos pagos nos últimos 30 dias.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {rankCategorias.slice(0, 10).map((r) => {
              const pct = totalCategoria > 0 ? (r.valor / totalCategoria) * 100 : 0;
              return (
                <li key={r.catId}>
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <span className="font-semibold text-brand-dark truncate flex-1">{r.nome}</span>
                    <span className="text-gray-500 flex-shrink-0">{pct.toFixed(1)}%</span>
                    <span className="font-extrabold text-brand-dark flex-shrink-0 min-w-[80px] text-right">
                      {fmtPreco(r.valor)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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

      <form
        action="/admin"
        method="get"
        className="bg-white rounded-2xl p-4 mb-4 shadow-sm flex flex-col sm:flex-row gap-2 items-start sm:items-center"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por número, nome ou telefone..."
          className="flex-1 h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
        />
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <FiltroLink atual={filtro} valor="ativos" rotulo="Ativos" />
          <FiltroLink atual={filtro} valor="aguardando" rotulo="Aguardando" />
          <FiltroLink atual={filtro} valor="concluidos" rotulo="Concluídos" />
          <FiltroLink atual={filtro} valor="todos" rotulo="Todos" />
        </div>
        <button
          type="submit"
          className="h-10 px-4 rounded-lg text-xs font-bold bg-brand-yellow text-brand-dark active:scale-95"
        >
          Buscar
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          Erro ao carregar pedidos: {error.message}
        </div>
      )}

      {!error && (!pedidos || pedidos.length === 0) && (
        <div className="bg-white rounded-2xl p-10 text-center text-sm text-gray-500 shadow-sm">
          Nenhum pedido encontrado.
        </div>
      )}

      <ul className="space-y-2">
        {pedidos?.map((p) => {
          const meta = STATUS_LABEL[p.status] ?? { texto: p.status, cor: "bg-gray-100 text-gray-700" };
          return (
            <li key={p.id}>
              <Link
                href={`/admin/${p.numero}`}
                className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-brand-dark text-sm truncate">{p.numero}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.cor}`}>
                        {meta.texto}
                      </span>
                    </div>
                    <p className="text-sm text-brand-dark truncate">{p.cliente_nome}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {fmtTelefone(p.cliente_telefone)} ·{" "}
                      {new Date(p.criado_em as string).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-extrabold text-brand-red">{fmtPreco(Number(p.total))}</p>
                    <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FiltroLink({ atual, valor, rotulo }: { atual: string; valor: string; rotulo: string }) {
  const ativo = atual === valor;
  return (
    <a
      href={`/admin?filtro=${valor}`}
      className={`px-2.5 h-7 rounded-full font-bold inline-flex items-center transition-colors ${
        ativo ? "bg-brand-yellow text-brand-dark" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      {rotulo}
    </a>
  );
}

function KpiSimples({
  rotulo,
  valor,
  Icon,
  accent,
}: {
  rotulo: string;
  valor: string;
  Icon: typeof ShoppingBag;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-xl inline-flex items-center justify-center mb-2 ${accent}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{rotulo}</p>
      <p className="text-lg font-extrabold text-brand-dark mt-0.5">{valor}</p>
    </div>
  );
}
