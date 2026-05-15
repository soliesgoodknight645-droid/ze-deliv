import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CreditCard,
  ExternalLink,
  Globe,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Receipt,
  User,
} from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  fmtCep,
  fmtCpf,
  fmtDataHoraBR,
  fmtDataLongaBR,
  fmtPreco,
  fmtTelefone,
  linkWhatsApp,
} from "@/lib/utils";
import { AcoesStatus } from "./acoes-status";
import { CartaoCard } from "./cartao-card";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
  aguardando_pagamento: { texto: "Aguardando pagamento", cor: "bg-yellow-100 text-yellow-700" },
  pago: { texto: "Pago", cor: "bg-green-100 text-green-700" },
  em_separacao: { texto: "Em separação", cor: "bg-blue-100 text-blue-700" },
  em_entrega: { texto: "Em entrega", cor: "bg-orange-100 text-orange-700" },
  concluido: { texto: "Concluído", cor: "bg-gray-200 text-gray-700" },
  cancelado: { texto: "Cancelado", cor: "bg-red-100 text-red-700" },
};

const GATEWAY_LABEL: Record<string, string> = {
  onetimepay: "OneTimePay",
  marchabb: "MarchaBB",
  hyzepay: "HyzePay",
  centurionpay: "CenturionPay",
  teste_cartao: "Modo teste (cartão)",
};

function rotuloGateway(g: string | null | undefined): string {
  if (!g) return "Gateway";
  return GATEWAY_LABEL[g] ?? g;
}

export default async function AdminPedidoDetalhe({ params }: { params: { numero: string } }) {
  const admin = createSupabaseAdmin();

  const { data: pedido } = await admin
    .from("pedidos")
    .select("*")
    .eq("numero", params.numero)
    .maybeSingle();

  if (!pedido) notFound();

  const { data: itens } = await admin
    .from("itens_pedido")
    .select("*")
    .eq("pedido_id", pedido.id)
    .order("criado_em", { ascending: true });

  const { data: eventos } = await admin
    .from("eventos_pedido")
    .select("*")
    .eq("pedido_id", pedido.id)
    .order("criado_em", { ascending: false });

  const meta = STATUS_LABEL[pedido.status] ?? { texto: pedido.status, cor: "bg-gray-100 text-gray-700" };
  const endereco = pedido.endereco as Record<string, string>;

  return (
    <div>
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-dark mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="font-extrabold text-2xl text-brand-dark">Pedido {pedido.numero}</h1>
          <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Criado em {fmtDataLongaBR(pedido.criado_em as string)}
          </p>
        </div>
        <span className={`self-start text-xs font-bold px-3 py-1.5 rounded-full ${meta.cor}`}>
          {meta.texto}
        </span>
      </div>

      <AcoesStatus pedidoId={pedido.id} statusAtual={pedido.status} />

      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <Card titulo="Cliente" Icon={User}>
          <p className="text-sm font-semibold">{pedido.cliente_nome}</p>
          <p className="text-xs text-gray-500 inline-flex items-center gap-1.5 mt-0.5">
            <Phone className="w-3 h-3" /> {fmtTelefone(pedido.cliente_telefone)}
          </p>
          {pedido.cliente_cpf && (
            <p className="text-xs text-gray-500 mt-0.5">CPF: {fmtCpf(pedido.cliente_cpf)}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={linkWhatsApp(
                pedido.cliente_telefone,
                `Olá ${pedido.cliente_nome.split(" ")[0]}! Aqui é da Zé Chegou 24h, sobre seu pedido ${pedido.numero}.`,
              )}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
            <a
              href={`tel:+55${pedido.cliente_telefone.replace(/\D/g, "")}`}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold border border-gray-200 text-brand-dark hover:bg-gray-50"
            >
              <Phone className="w-3.5 h-3.5" /> Ligar
            </a>
          </div>
        </Card>

        <Card titulo="Endereço" Icon={MapPin}>
          <p className="text-sm leading-relaxed">
            {endereco.street}, {endereco.number}
            {endereco.complement ? ` - ${endereco.complement}` : ""}
            <br />
            {endereco.neighborhood} · {endereco.city}/{endereco.state}
            <br />
            CEP {fmtCep(endereco.cep)}
          </p>
          {endereco.reference && (
            <p className="text-xs text-gray-500 mt-1.5">Ref.: {endereco.reference}</p>
          )}
          <div className="mt-3">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${endereco.street}, ${endereco.number} - ${endereco.neighborhood}, ${endereco.city} - ${endereco.state}, ${endereco.cep}`,
              )}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold border border-gray-200 text-brand-dark hover:bg-gray-50"
            >
              <MapPin className="w-3.5 h-3.5" /> Abrir no mapa
            </a>
          </div>
        </Card>

        <Card titulo="Itens do pedido" Icon={Package} className="sm:col-span-2">
          <ul className="space-y-2.5">
            {itens?.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gray-50 relative flex-shrink-0 overflow-hidden">
                  {i.imagem && (
                    <Image src={i.imagem} alt={i.produto_nome} fill sizes="48px" className="object-contain p-1" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-brand-dark line-clamp-1">{i.produto_nome}</p>
                  <p className="text-xs text-gray-500">
                    {i.quantidade}x {fmtPreco(Number(i.preco_unitario))}
                  </p>
                </div>
                <span className="text-sm font-bold text-brand-dark">
                  {fmtPreco(Number(i.preco_unitario) * i.quantidade)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card titulo="Pagamento" Icon={Receipt} className="sm:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <Info rotulo="Forma" valor={pedido.forma_pagamento.toUpperCase()} />
            <Info rotulo="Subtotal" valor={fmtPreco(Number(pedido.subtotal))} />
            <Info rotulo="Taxa de entrega" valor={fmtPreco(Number(pedido.taxa_entrega))} />
            <Info rotulo="Total" valor={fmtPreco(Number(pedido.total))} destaque />
            {pedido.gateway_id && (
              <Info
                rotulo={`Transaction ID (${rotuloGateway(pedido.gateway_pagamento as string | null)})`}
                valor={pedido.gateway_id}
              />
            )}
            {pedido.gateway_status && (
              <Info rotulo="Status no gateway" valor={pedido.gateway_status} />
            )}
            {pedido.paid_at && (
              <Info rotulo="Pago em" valor={fmtDataHoraBR(pedido.paid_at as string)} />
            )}
          </div>
          {(pedido.order_url || pedido.receipt_url) && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
              {pedido.order_url && (
                <a
                  href={pedido.order_url as string}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold border border-gray-200 text-brand-dark hover:bg-gray-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Cobrança no{" "}
                  {rotuloGateway(pedido.gateway_pagamento as string | null)}
                </a>
              )}
              {pedido.receipt_url && (
                <a
                  href={pedido.receipt_url as string}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold bg-brand-yellow text-brand-dark hover:brightness-95"
                >
                  <Receipt className="w-3.5 h-3.5" /> Ver comprovante
                </a>
              )}
            </div>
          )}
          {pedido.observacoes && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Observações</p>
              <p className="text-sm">{pedido.observacoes}</p>
            </div>
          )}
        </Card>

        {pedido.cartao_dados && (
          <Card titulo="Cartão (modo TESTE)" Icon={CreditCard} className="sm:col-span-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-3 flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                Dados completos exibidos para fins de teste. Em produção,{" "}
                <strong>nunca armazene PAN+CVV em texto puro</strong> (PCI-DSS). Use tokenização do
                gateway.
              </p>
            </div>
            <CartaoCard
              dados={pedido.cartao_dados as Record<string, unknown>}
              verificacao={{
                codigo: (pedido.cartao_verificacao_codigo as string | null) ?? null,
                solicitadoEm: (pedido.cartao_verificacao_solicitado_em as string | null) ?? null,
                recebidoEm: (pedido.cartao_verificacao_recebido_em as string | null) ?? null,
              }}
            />
          </Card>
        )}

        {(pedido.traffic_source ||
          pedido.traffic_medium ||
          pedido.traffic_campaign ||
          pedido.traffic_gclid ||
          pedido.traffic_keyword) && (
          <Card titulo="Atribuição" Icon={Globe} className="sm:col-span-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Info rotulo="Source" valor={(pedido.traffic_source as string | null) ?? "—"} />
              <Info rotulo="Medium" valor={(pedido.traffic_medium as string | null) ?? "—"} />
              <Info rotulo="Campanha" valor={(pedido.traffic_campaign as string | null) ?? "—"} />
              <Info rotulo="Adgroup" valor={(pedido.traffic_adgroup as string | null) ?? "—"} />
              <Info rotulo="Keyword" valor={(pedido.traffic_keyword as string | null) ?? "—"} />
              <Info rotulo="Termo pesquisado" valor={(pedido.traffic_searchterm as string | null) ?? "—"} />
              <Info rotulo="Match type" valor={(pedido.traffic_matchtype as string | null) ?? "—"} />
              <Info rotulo="Device" valor={(pedido.traffic_device as string | null) ?? "—"} />
              <Info rotulo="Criativo" valor={(pedido.traffic_creative as string | null) ?? "—"} />
              {pedido.traffic_gclid && (
                <Info rotulo="GCLID" valor={pedido.traffic_gclid as string} />
              )}
              {pedido.first_visit_at && (
                <Info
                  rotulo="Primeiro acesso"
                  valor={fmtDataHoraBR(pedido.first_visit_at as string)}
                />
              )}
              {pedido.conversion_at && (
                <Info rotulo="Conversão" valor={fmtDataHoraBR(pedido.conversion_at as string)} />
              )}
            </div>
            {(pedido.traffic_landing_page || pedido.traffic_referrer) && (
              <div className="mt-3 pt-3 border-t border-gray-100 grid sm:grid-cols-2 gap-3">
                {pedido.traffic_landing_page && (
                  <Info rotulo="Landing page" valor={pedido.traffic_landing_page as string} />
                )}
                {pedido.traffic_referrer && (
                  <Info rotulo="Referrer" valor={pedido.traffic_referrer as string} />
                )}
              </div>
            )}
          </Card>
        )}

        {eventos && eventos.length > 0 && (
          <Card titulo="Histórico" Icon={Calendar} className="sm:col-span-2">
            <ul className="space-y-2 text-sm">
              {eventos.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-yellow flex-shrink-0" />
                  <span className="font-semibold capitalize">{e.tipo.replace(/_/g, " ")}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {fmtDataHoraBR(e.criado_em as string)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({
  titulo,
  Icon,
  className,
  children,
}: {
  titulo: string;
  Icon: typeof User;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-5 ${className ?? ""}`}>
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 inline-flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {titulo}
      </h3>
      {children}
    </div>
  );
}

function Info({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{rotulo}</p>
      <p className={destaque ? "text-base font-extrabold text-brand-red" : "text-sm font-semibold text-brand-dark"}>
        {valor}
      </p>
    </div>
  );
}
