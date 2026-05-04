import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Home, MapPin, Phone, Receipt, User } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fmtPreco } from "@/lib/utils";
import { obterWhatsappSuporte } from "@/lib/config-app";
import { gerarQrCodeDataUrl } from "@/lib/pagamento/qrcode";
import { CopiarNumero } from "./copiar-numero";
import { PixPagamento } from "./pix-pagamento";

export const metadata = {
  title: "Pedido confirmado — Zé Chegou 24h",
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pagamento confirmado",
  em_separacao: "Em separação",
  em_entrega: "Em entrega",
  concluido: "Pedido concluído",
  cancelado: "Pedido cancelado",
};

type Params = { numero: string };

export default async function PedidoPage({ params }: { params: Promise<Params> }) {
  const { numero } = await params;
  const sb = createSupabaseAdmin();

  const { data: pedido } = await sb
    .from("pedidos")
    .select(
      "id,numero,status,forma_pagamento,total,cliente_nome,cliente_telefone,cliente_cpf,endereco,criado_em,pix_qr_code,pix_qr_image,paid_at",
    )
    .eq("numero", numero)
    .maybeSingle();

  if (!pedido) notFound();

  const [{ data: itens }, whatsappSuporte] = await Promise.all([
    sb
      .from("itens_pedido")
      .select("id,produto_nome,imagem,quantidade,preco_unitario")
      .eq("pedido_id", pedido.id)
      .order("criado_em", { ascending: true }),
    obterWhatsappSuporte(),
  ]);

  const endereco = pedido.endereco as Record<string, string>;
  const previsao = new Date(new Date(pedido.criado_em as string).getTime() + 40 * 60 * 1000)
    .toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const jaPago = pedido.status === "pago" || pedido.status === "concluido";

  const qrCodeTexto = (pedido.pix_qr_code as string | null) ?? null;
  const imagemSalva = (pedido.pix_qr_image as string | null) ?? null;
  // Confiamos apenas em data URLs (base64 inline). URLs externas (http/https)
  // de gateways como OneTimePay frequentemente quebram (CORS, expiracao,
  // bloqueio do navegador), entao geramos um QR local em cima do codigo.
  const imagemConfiavel =
    imagemSalva && imagemSalva.startsWith("data:") ? imagemSalva : null;
  let qrImagemFinal = imagemConfiavel;
  if (!qrImagemFinal && qrCodeTexto) {
    qrImagemFinal = await gerarQrCodeDataUrl(qrCodeTexto);
  }

  return (
    <div className="min-h-screen bg-brand-gray">
      <Header />
      <div className="max-w-screen-md mx-auto px-4 py-6">
        {!jaPago && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center mb-4">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-green-500" />
            </div>
            <h1 className="font-extrabold text-2xl text-brand-dark mb-1 font-display">Pedido recebido!</h1>
            <p className="text-sm text-gray-500">{STATUS_LABEL[pedido.status] ?? pedido.status}</p>

            <div className="mt-5 inline-flex items-center gap-2 bg-brand-yellow/15 border border-brand-yellow/40 rounded-full px-4 h-9">
              <Receipt className="w-4 h-4 text-brand-dark" />
              <span className="text-sm font-bold text-brand-dark">#{numero}</span>
              <CopiarNumero numero={numero} />
            </div>

            <div className="mt-4 inline-flex items-center gap-2 text-sm text-brand-dark">
              <Clock className="w-4 h-4 text-brand-yellow" />
              Previsão de entrega: <span className="font-bold">{previsao}</span> (até 40 min)
            </div>
          </div>
        )}

        {pedido.forma_pagamento === "pix" && (
          <PixPagamento
            numero={numero}
            qrCode={qrCodeTexto}
            qrImage={qrImagemFinal}
            initialStatus={pedido.status as string}
            initialPaidAt={(pedido.paid_at as string | null) ?? null}
            whatsappSuporte={whatsappSuporte}
            cliente={{
              nome: pedido.cliente_nome as string,
              telefone: pedido.cliente_telefone as string,
              cpf: (pedido.cliente_cpf as string | null) ?? "",
              endereco: {
                cep: endereco.cep ?? "",
                street: endereco.street ?? "",
                number: endereco.number ?? "",
                complement: endereco.complement ?? "",
                neighborhood: endereco.neighborhood ?? "",
                city: endereco.city ?? "",
                state: endereco.state ?? "",
                reference: endereco.reference ?? "",
              },
            }}
          />
        )}

        {jaPago && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[11px] uppercase font-semibold text-gray-400 tracking-wide">
                Número do pedido
              </p>
              <p className="text-base font-extrabold text-brand-dark">#{numero}</p>
            </div>
            <CopiarNumero numero={numero} />
          </div>
        )}

        {pedido.forma_pagamento === "card" && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-4">
            <p className="font-bold text-blue-900 text-sm mb-1">
              Pagamento por cartão registrado (modo teste)
            </p>
            <p className="text-xs text-blue-800 leading-relaxed">
              Seus dados de cartão foram registrados pra validação interna. Nada foi cobrado neste
              momento. Em breve nosso time confirma seu pedido por WhatsApp.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <h3 className="text-sm font-bold text-brand-dark mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-brand-yellow" /> Dados do cliente
          </h3>
          <p className="text-sm text-brand-dark">{pedido.cliente_nome}</p>
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3" /> {pedido.cliente_telefone}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <h3 className="text-sm font-bold text-brand-dark mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand-yellow" /> Endereço de entrega
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed">
            {endereco.street}, {endereco.number}
            {endereco.complement ? ` · ${endereco.complement}` : ""}
            <br />
            {endereco.neighborhood} · {endereco.city}/{endereco.state}
            <br />
            CEP {endereco.cep}
            {endereco.reference && (
              <>
                <br />
                <span className="text-xs text-gray-500">Ref.: {endereco.reference}</span>
              </>
            )}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <h3 className="text-sm font-bold text-brand-dark mb-3">Itens</h3>
          <ul className="space-y-3">
            {itens?.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gray-50 relative flex-shrink-0 overflow-hidden">
                  {item.imagem && (
                    <Image
                      src={item.imagem}
                      alt={item.produto_nome}
                      fill
                      sizes="48px"
                      className="object-contain p-1"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-brand-dark line-clamp-1">{item.produto_nome}</p>
                  <p className="text-xs text-gray-500">
                    {item.quantidade}x {fmtPreco(Number(item.preco_unitario))}
                  </p>
                </div>
                <span className="text-sm font-bold text-brand-dark">
                  {fmtPreco(Number(item.preco_unitario) * item.quantidade)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-100 mt-4 pt-3 flex justify-between">
            <span className="text-sm text-gray-500">Total</span>
            <span className="font-extrabold text-lg text-brand-red">{fmtPreco(Number(pedido.total))}</span>
          </div>
        </div>

        <Link
          href="/"
          className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm bg-brand-yellow text-brand-dark mb-3"
        >
          <Home className="w-4 h-4" /> Continuar comprando
        </Link>
      </div>
      <Footer />
    </div>
  );
}
