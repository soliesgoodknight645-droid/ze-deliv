"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { fmtPreco } from "@/lib/utils";

export type Ranking = {
  chave: string;
  leads: number;
  pedidos: number;
  faturamento: number;
};

export type LinhaPedidoDashboard = {
  id: string;
  numero: string;
  cliente: string;
  telefone: string;
  produto: string;
  total: number;
  status: string;
  statusLabel: string;
  statusCor: string;
  criadoEm: string;
  paidAt: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  adgroup: string | null;
  keyword: string | null;
  searchterm: string | null;
  matchtype: string | null;
  device: string | null;
  gclid: string | null;
  firstVisitAt: string | null;
};

export type DiaSerie = {
  data: string;
  leads: number;
  pagos: number;
  faturamento: number;
};

type GraficoProps = { kind: "grafico"; serie: DiaSerie[] };
type TabelaProps = { kind: "tabela"; linhas: LinhaPedidoDashboard[] };

export function DashboardClient(props: GraficoProps | TabelaProps) {
  if (props.kind === "grafico") return <GraficoFaturamento serie={props.serie} />;
  return <TabelaPedidos linhas={props.linhas} />;
}

// =====================================================================
// GRÁFICO — SVG nativo, sem dependências
// =====================================================================
function GraficoFaturamento({ serie }: { serie: DiaSerie[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (serie.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-10">Sem dados no período.</p>;
  }

  const W = 720;
  const H = 240;
  const padL = 50;
  const padR = 12;
  const padT = 18;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxFat = Math.max(...serie.map((d) => d.faturamento), 1);
  const maxLead = Math.max(...serie.map((d) => d.leads), 1);

  const x = (i: number) =>
    serie.length === 1 ? padL + innerW / 2 : padL + (i * innerW) / (serie.length - 1);
  const yFat = (v: number) => padT + innerH - (v / maxFat) * innerH;
  const yLead = (v: number) => padT + innerH - (v / maxLead) * innerH;

  const pathFat = serie
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yFat(d.faturamento).toFixed(1)}`)
    .join(" ");
  const areaFat = `${pathFat} L ${x(serie.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
  const pathLead = serie
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yLead(d.leads).toFixed(1)}`)
    .join(" ");

  const totalFat = serie.reduce((s, d) => s + d.faturamento, 0);
  const totalLead = serie.reduce((s, d) => s + d.leads, 0);

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-xs">
        <div className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-brand-yellow" /> Faturamento ({fmtPreco(totalFat)})
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-500" /> Leads ({totalLead})
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[240px]">
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={padT + innerH * p}
                y2={padT + innerH * p}
                stroke="#f1f5f9"
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={padT + innerH * p + 3}
                textAnchor="end"
                fontSize={9}
                fill="#94a3b8"
              >
                {fmtPreco(maxFat * (1 - p))}
              </text>
            </g>
          ))}
          <path d={areaFat} fill="rgba(255, 208, 0, 0.18)" />
          <path d={pathFat} fill="none" stroke="#FFD000" strokeWidth={2.5} />
          <path d={pathLead} fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 3" />

          {serie.map((d, i) => (
            <g key={d.data}>
              <circle
                cx={x(i)}
                cy={yFat(d.faturamento)}
                r={hover === i ? 4 : 2.5}
                fill="#FFD000"
                stroke="#1f2937"
                strokeWidth={hover === i ? 1.5 : 0}
              />
              <rect
                x={x(i) - innerW / serie.length / 2}
                y={padT}
                width={Math.max(innerW / serie.length, 8)}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}

          {serie.length <= 16 &&
            serie.map((d, i) => (
              <text
                key={d.data}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize={9}
                fill="#94a3b8"
              >
                {d.data.slice(5)}
              </text>
            ))}
        </svg>
        {hover !== null && (
          <div
            className="absolute pointer-events-none bg-brand-dark text-white text-[11px] px-2 py-1.5 rounded-lg shadow-lg whitespace-nowrap"
            style={{
              left: `calc(${(x(hover) / W) * 100}% - 70px)`,
              top: 4,
            }}
          >
            <div className="font-bold">
              {new Date(`${serie[hover].data}T12:00:00`).toLocaleDateString("pt-BR")}
            </div>
            <div className="text-yellow-300">{fmtPreco(serie[hover].faturamento)}</div>
            <div className="text-blue-300">
              {serie[hover].leads} leads · {serie[hover].pagos} pagos
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// TABELA ORDENÁVEL
// =====================================================================
type SortKey =
  | "criadoEm"
  | "cliente"
  | "total"
  | "status"
  | "source"
  | "medium"
  | "campaign"
  | "keyword";

function TabelaPedidos({ linhas }: { linhas: LinhaPedidoDashboard[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("criadoEm");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 25;

  const ordenadas = useMemo(() => {
    const cp = [...linhas];
    cp.sort((a, b) => {
      const va = (a[sortKey] ?? "") as string | number;
      const vb = (b[sortKey] ?? "") as string | number;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), "pt-BR");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return cp;
  }, [linhas, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPages);
  const visiveis = ordenadas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const toggle = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
    setPagina(1);
  };

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => {
    const ativo = sortKey === k;
    return (
      <th className="text-left px-3 py-2 font-bold text-gray-500 whitespace-nowrap">
        <button
          type="button"
          onClick={() => toggle(k)}
          className={`inline-flex items-center gap-1 hover:text-brand-dark ${ativo ? "text-brand-dark" : ""}`}
        >
          {children}
          {ativo ? (
            sortDir === "asc" ? (
              <ArrowUp className="w-3 h-3" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-40" />
          )}
        </button>
      </th>
    );
  };

  if (linhas.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 py-12">
        Nenhum pedido no período/filtros selecionados.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wider">
          <tr>
            <Th k="criadoEm">Data</Th>
            <Th k="cliente">Cliente</Th>
            <th className="text-left px-3 py-2 font-bold text-gray-500 whitespace-nowrap">
              Telefone
            </th>
            <th className="text-left px-3 py-2 font-bold text-gray-500 whitespace-nowrap">
              Produto
            </th>
            <Th k="total">Valor</Th>
            <Th k="status">Status</Th>
            <Th k="source">Source</Th>
            <Th k="medium">Medium</Th>
            <Th k="campaign">Campanha</Th>
            <th className="text-left px-3 py-2 font-bold text-gray-500 whitespace-nowrap">
              Adgroup
            </th>
            <Th k="keyword">Keyword</Th>
            <th className="text-left px-3 py-2 font-bold text-gray-500 whitespace-nowrap">
              Termo pesquisado
            </th>
            <th className="text-left px-3 py-2 font-bold text-gray-500 whitespace-nowrap">
              Device
            </th>
            <th className="text-left px-3 py-2 font-bold text-gray-500 whitespace-nowrap"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visiveis.map((l) => (
            <tr key={l.id} className="hover:bg-gray-50/50">
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                {new Date(l.criadoEm).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </td>
              <td className="px-3 py-2 font-semibold text-brand-dark">{l.cliente}</td>
              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.telefone}</td>
              <td className="px-3 py-2 text-gray-700 max-w-[220px] truncate" title={l.produto}>
                {l.produto}
              </td>
              <td className="px-3 py-2 font-extrabold text-brand-red whitespace-nowrap">
                {fmtPreco(l.total)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.statusCor}`}>
                  {l.statusLabel}
                </span>
              </td>
              <Cel valor={l.source} />
              <Cel valor={l.medium} />
              <Cel valor={l.campaign} />
              <Cel valor={l.adgroup} />
              <Cel valor={l.keyword} />
              <Cel valor={l.searchterm} truncar />
              <Cel valor={l.device} />
              <td className="px-3 py-2 whitespace-nowrap">
                <Link
                  href={`/admin/${l.numero}`}
                  className="inline-flex items-center text-gray-400 hover:text-brand-dark"
                  title="Ver pedido"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 text-xs">
          <span className="text-gray-400">
            Página {paginaAtual} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={paginaAtual === 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              className="h-8 px-3 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 font-bold"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={paginaAtual === totalPages}
              onClick={() => setPagina((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-3 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 font-bold"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Cel({ valor, truncar }: { valor: string | null; truncar?: boolean }) {
  if (!valor) {
    return (
      <td className="px-3 py-2">
        <span className="text-gray-300">—</span>
      </td>
    );
  }
  return (
    <td className={`px-3 py-2 text-gray-700 whitespace-nowrap ${truncar ? "max-w-[180px] truncate" : ""}`} title={valor}>
      {valor}
    </td>
  );
}
