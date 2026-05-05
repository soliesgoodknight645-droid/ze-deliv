"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronRight,
  Clock,
  Gift,
  Info,
  Loader2,
  Percent,
  ShoppingCart,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/contexts/CartContext";
import { formatarMmSs, useUpsell } from "@/contexts/UpsellContext";
import {
  CUPOM_UPSELL,
  calcularDescontoUpsell,
  validarSubtotalUpsell,
} from "@/lib/cupom-upsell";
import { fmtPreco } from "@/lib/utils";
import { lerAtribuicaoCliente } from "@/lib/atribuicao";
import type { Categoria, Produto } from "@/lib/types";
import { criarPedidoUpsell, type ItemUpsellInput } from "./actions";

type Secao = { cat: Categoria; produtos: Produto[] };

const CHAVE_REGRAS_VISTAS = "ze:upsell-regras-vistas:v1";

export function UpsellClient({ secoes }: { secoes: Secao[] }) {
  const router = useRouter();
  const { itens, totalValor, totalItens, limpar, pronto: cartPronto } = useCart();
  const upsell = useUpsell();
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const carrinhoZeradoRef = useRef(false);

  // Quando a pagina abre pela primeira vez com cupom valido, esvazia o carrinho
  // antigo (do pedido pago) UMA vez pra a pessoa montar um carrinho novo
  // proprio do upsell.
  useEffect(() => {
    if (!cartPronto || !upsell.pronto || !upsell.ativo) return;
    if (carrinhoZeradoRef.current) return;
    try {
      const flag = sessionStorage.getItem(`ze:upsell-carrinho-zerado:${upsell.pedidoRef}`);
      if (!flag) {
        limpar();
        sessionStorage.setItem(
          `ze:upsell-carrinho-zerado:${upsell.pedidoRef}`,
          "1",
        );
      }
    } catch {}
    carrinhoZeradoRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartPronto, upsell.pronto, upsell.ativo, upsell.pedidoRef]);

  // Mostra modal de regras na primeira visita (por upsell ativo)
  useEffect(() => {
    if (!upsell.pronto || !upsell.ativo) return;
    try {
      const visto = localStorage.getItem(`${CHAVE_REGRAS_VISTAS}:${upsell.pedidoRef}`);
      if (!visto) {
        setRegrasAbertas(true);
      }
    } catch {}
  }, [upsell.pronto, upsell.ativo, upsell.pedidoRef]);

  // Se nao tem cupom ativo, manda pra home (cupom expirou ou pessoa entrou direto)
  useEffect(() => {
    if (!upsell.pronto) return;
    if (!upsell.ativo) {
      toast.info("Cupom expirado ou indisponível");
      router.replace("/");
    }
  }, [upsell.pronto, upsell.ativo, router]);

  const fecharRegras = () => {
    setRegrasAbertas(false);
    try {
      localStorage.setItem(
        `${CHAVE_REGRAS_VISTAS}:${upsell.pedidoRef}`,
        "1",
      );
    } catch {}
  };

  const validacao = validarSubtotalUpsell(totalValor);
  const calc = useMemo(() => calcularDescontoUpsell(totalValor), [totalValor]);
  const podeFinalizar = validacao.ok && totalItens > 0 && !enviando;

  const finalizar = useCallback(async () => {
    const v = validarSubtotalUpsell(totalValor);
    if (!upsell.ativo || !upsell.pedidoRef) {
      toast.error("Cupom não está mais válido");
      return;
    }
    if (!v.ok) {
      toast.error(v.motivo);
      return;
    }

    setEnviando(true);
    try {
      const itensInput: ItemUpsellInput[] = itens.map((i) => ({
        produtoId: i.produtoId,
        slug: i.slug,
        nome: i.nome,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        imagem: i.imagem,
      }));

      const a = lerAtribuicaoCliente();
      const r = await criarPedidoUpsell({
        pedidoRefNumero: upsell.pedidoRef,
        itens: itensInput,
        atribuicao: {
          source: a.source,
          medium: a.medium,
          campaign: a.campaign,
          adgroup: a.adgroup,
          keyword: a.keyword,
          searchterm: a.searchterm,
          matchtype: a.matchtype,
          device: a.device,
          creative: a.creative,
          gclid: a.gclid,
          landingPage: a.landingPage,
          referrer: a.referrer,
          firstVisitAt: a.firstVisitAt,
        },
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      // Sucesso: desativa cupom, limpa carrinho, vai pra tela do novo pedido
      upsell.desativar();
      limpar();
      router.push(`/pedido/${r.numero}`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar pedido upsell");
    } finally {
      setEnviando(false);
    }
  }, [
    itens,
    limpar,
    router,
    totalValor,
    upsell.ativo,
    upsell.desativar,
    upsell.pedidoRef,
  ]);

  useEffect(() => {
    upsell.registrarPagarPixUpsell(finalizar);
    return () => upsell.registrarPagarPixUpsell(null);
  }, [upsell.registrarPagarPixUpsell, finalizar]);

  if (!upsell.pronto) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!upsell.ativo) return null;

  const tempoCritico = upsell.tempoVitrineSeg <= 60;
  const faltaParaMin =
    validacao.ok || validacao.tipo === "acima"
      ? 0
      : Math.max(0, CUPOM_UPSELL.VALOR_MINIMO - totalValor);

  return (
    <div className="bg-brand-gray min-h-screen pb-40">
      {/* === Tarja superior do cupom + cronometro === */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-yellow-400 via-brand-yellow to-yellow-400 shadow-md">
        <div className="max-w-screen-md mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-dark flex items-center justify-center flex-shrink-0">
            <Gift className="w-5 h-5 text-brand-yellow" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-dark/80 leading-none">
              Cupom ativo
            </p>
            <p className="text-sm font-extrabold text-brand-dark leading-tight">
              50% OFF será aplicado!
            </p>
          </div>
          <div
            className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-xl flex-shrink-0 ${
              tempoCritico ? "bg-red-600 text-white animate-pulse" : "bg-brand-dark text-brand-yellow"
            }`}
          >
            <p className="text-[8px] font-bold uppercase tracking-wider opacity-80 leading-none">
              Restam
            </p>
            <p className="font-extrabold text-xl tabular-nums leading-tight">
              {formatarMmSs(upsell.tempoVitrineSeg)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRegrasAbertas(true)}
            aria-label="Ver regras"
            className="w-9 h-9 rounded-full bg-brand-dark/10 hover:bg-brand-dark/20 text-brand-dark flex items-center justify-center flex-shrink-0"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* === Hero === */}
      <div className="max-w-screen-md mx-auto px-4 pt-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-yellow-200 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6 text-brand-yellow" />
          </div>
          <div className="flex-1">
            <p className="font-extrabold text-brand-dark text-base leading-tight">
              Adicione mais produtos!
            </p>
            <p className="text-xs text-gray-500 leading-snug">
              Pedido mínimo R$ {CUPOM_UPSELL.VALOR_MINIMO},00 · vai junto com
              sua entrega anterior
            </p>
          </div>
        </div>
      </div>

      {/* === Catalogo (mesma estrutura da home) === */}
      <div className="max-w-screen-md mx-auto pt-4">
        {secoes.map(({ cat, produtos }, idx) => (
          <section
            key={cat.id}
            className={idx % 2 === 0 ? "py-4 bg-white" : "py-4 bg-brand-gray"}
          >
            <div className="px-4 flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-base text-brand-dark font-display">
                {cat.name}
              </h2>
              <Link
                href={`/produtos?category=${encodeURIComponent(cat.slug)}`}
                className="inline-flex items-center text-xs text-gray-500 active:text-brand-dark"
              >
                Ver tudo <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 px-4">
              {produtos.map((p, i) => (
                <div key={p.id} className="flex-shrink-0 w-[155px]">
                  <ProductCard produto={p} prioridade={idx === 0 && i < 4} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* === Sticky bottom bar === */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
        <div className="max-w-screen-md mx-auto px-4 py-3">
          {totalItens === 0 ? (
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-gray-400" />
              <p className="flex-1 text-sm text-gray-500">
                Adicione produtos ao carrinho pra usar o cupom
              </p>
            </div>
          ) : (
            <>
              {/* Mensagem de status (faltam R$X / cupom valido / acima do limite) */}
              {!validacao.ok && validacao.tipo === "abaixo" && (
                <div className="flex items-center gap-2 mb-2 px-2.5 py-2 rounded-xl bg-yellow-50 border border-yellow-200 text-xs text-yellow-900">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="leading-tight">
                    Faltam <strong>{fmtPreco(faltaParaMin)}</strong> pra
                    destravar o cupom
                  </span>
                </div>
              )}
              {!validacao.ok && validacao.tipo === "acima" && (
                <div className="flex items-center gap-2 mb-2 px-2.5 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="leading-tight">
                    Cupom não se aplica acima de R$ {CUPOM_UPSELL.VALOR_MAXIMO},00
                  </span>
                </div>
              )}
              {validacao.ok && (
                <div className="flex items-center gap-2 mb-2 px-2.5 py-2 rounded-xl bg-green-50 border border-green-200 text-xs text-green-900">
                  <Percent className="w-4 h-4 flex-shrink-0" />
                  <span className="leading-tight">
                    50% OFF aplicado! Você economiza{" "}
                    <strong>{fmtPreco(calc.desconto)}</strong>
                  </span>
                </div>
              )}

              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase font-bold text-gray-400 leading-none">
                    {totalItens} {totalItens === 1 ? "item" : "itens"}
                  </p>
                  {validacao.ok ? (
                    <div className="flex items-baseline gap-2 leading-none">
                      <span className="text-xs text-gray-400 line-through">
                        {fmtPreco(totalValor)}
                      </span>
                      <span className="text-xl font-extrabold text-brand-red">
                        {fmtPreco(calc.total)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xl font-extrabold text-brand-dark leading-none">
                      {fmtPreco(totalValor)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={finalizar}
                  disabled={!podeFinalizar}
                  className="h-12 px-5 rounded-xl font-extrabold text-sm bg-brand-yellow text-brand-dark active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 flex-shrink-0"
                >
                  {enviando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Gerando...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" /> Pagar com PIX
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* === Modal de regras === */}
      {regrasAbertas && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm">
          <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-400 via-brand-yellow to-yellow-400 px-5 py-4 flex items-center gap-3">
              <Gift className="w-7 h-7 text-brand-dark" />
              <div className="flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-dark/80 leading-none">
                  Cupom da roleta
                </p>
                <p className="font-extrabold text-lg text-brand-dark leading-tight">
                  50% OFF · regras
                </p>
              </div>
              <button
                type="button"
                onClick={fecharRegras}
                aria-label="Fechar regras"
                className="w-9 h-9 rounded-full bg-brand-dark/10 hover:bg-brand-dark/20 text-brand-dark flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <RegraItem
                numero={1}
                titulo={`Pedido mínimo de R$ ${CUPOM_UPSELL.VALOR_MINIMO},00`}
                texto={`O carrinho precisa atingir R$ ${CUPOM_UPSELL.VALOR_MINIMO},00 (sem o desconto) pra o cupom liberar.`}
              />
              <RegraItem
                numero={2}
                titulo="Compra em até 5 minutos"
                texto="Pra o pedido sair junto com o que você acabou de pedir e tudo chegar na MESMA entrega, finalize em até 5 minutos."
              />
              <RegraItem
                numero={3}
                titulo="Pedidos de até R$ 999,00"
                texto="O cupom não se aplica em pedidos acima de R$ 999,00. Se passar, basta tirar alguns itens."
              />

              <div className="flex items-center gap-2 mt-2 px-3 py-2.5 rounded-xl bg-yellow-50 border border-yellow-200">
                <Clock className="w-4 h-4 text-yellow-700 flex-shrink-0" />
                <p className="text-xs text-yellow-900 leading-snug">
                  Você não precisa preencher endereço de novo — o pedido vai
                  pro mesmo lugar do anterior.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharRegras}
                className="w-full h-12 rounded-xl font-extrabold text-sm bg-brand-yellow text-brand-dark active:scale-[0.98] transition-transform mt-2"
              >
                Entendi, montar meu pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RegraItem({
  numero,
  titulo,
  texto,
}: {
  numero: number;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-brand-yellow/20 border border-brand-yellow flex items-center justify-center flex-shrink-0">
        <span className="font-extrabold text-sm text-brand-dark">{numero}</span>
      </div>
      <div className="flex-1">
        <p className="font-extrabold text-sm text-brand-dark">{titulo}</p>
        <p className="text-xs text-gray-500 leading-snug">{texto}</p>
      </div>
    </div>
  );
}
