"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Drawer } from "vaul";
import { Loader2, Minus, Plus, ShoppingBag, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";
import { useUpsell } from "@/contexts/UpsellContext";
import {
  aplicarPrecoLiquidoNosItens,
  calcularDescontoUpsell,
  validarSubtotalUpsell,
} from "@/lib/cupom-upsell";
import { mensagemErroPedidoMinimo, PEDIDO_MINIMO_REAIS, subtotalAbaixoDoMinimo } from "@/lib/pedido-minimo";
import { fmtPreco } from "@/lib/utils";

export function CartSheet() {
  const router = useRouter();
  const upsell = useUpsell();
  const { itens, totalValor, alterarQtd, remover, drawerAberto, fecharDrawer } = useCart();
  const [pixEnviando, setPixEnviando] = useState(false);

  const validacaoUpsell = upsell.ativo ? validarSubtotalUpsell(totalValor) : null;
  const cupomUpsellAplica = validacaoUpsell?.ok === true;
  const podePagarPixUpsell =
    upsell.ativo &&
    cupomUpsellAplica &&
    itens.length > 0 &&
    upsell.tempoRestanteSeg > 0;
  const calcUpsell = cupomUpsellAplica ? calcularDescontoUpsell(totalValor) : null;

  const precosLiquidoPorId = useMemo(() => {
    if (!cupomUpsellAplica || !calcUpsell) return null;
    const ajustados = aplicarPrecoLiquidoNosItens(
      itens.map((i) => ({
        produtoId: i.produtoId,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
      })),
      totalValor,
      calcUpsell.total,
    );
    return new Map(ajustados.map((x) => [x.produtoId, x.precoUnitario]));
  }, [cupomUpsellAplica, calcUpsell, itens, totalValor]);

  const irParaCheckout = () => {
    if (upsell.ativo) {
      toast.info("Pra manter o 50% OFF, use Pagar com PIX pelo cupom — não finalize pelo checkout comum.");
      fecharDrawer();
      router.push("/upsell");
      return;
    }
    if (subtotalAbaixoDoMinimo(totalValor)) {
      toast.error(mensagemErroPedidoMinimo());
      return;
    }
    fecharDrawer();
    router.push("/checkout");
  };

  const pagarPixUpsell = async () => {
    if (!podePagarPixUpsell || pixEnviando) return;
    setPixEnviando(true);
    try {
      fecharDrawer();
      await upsell.executarPagarPixUpsell();
    } finally {
      setPixEnviando(false);
    }
  };

  const irAoCupom = () => {
    fecharDrawer();
    router.push("/upsell");
  };

  return (
    <Drawer.Root open={drawerAberto} onOpenChange={(v) => !v && fecharDrawer()} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
        <Drawer.Content className="bg-white flex flex-col rounded-t-3xl mt-24 fixed bottom-0 left-0 right-0 max-h-[90vh] z-[70]">
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-200 my-3" />
          <div className="flex items-center justify-between px-5 pb-3">
            <Drawer.Title className="font-extrabold text-lg text-brand-dark">
              Carrinho ({itens.length})
            </Drawer.Title>
            <button
              type="button"
              onClick={fecharDrawer}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200"
              aria-label="Fechar"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {itens.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <ShoppingBag className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500 mb-4">Seu carrinho está vazio.</p>
              <button
                type="button"
                onClick={fecharDrawer}
                className="h-11 px-6 rounded-full font-bold text-sm bg-brand-yellow text-brand-dark"
              >
                Continuar comprando
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-y-auto px-5 space-y-2 flex-1 pb-2">
                {itens.map((i) => (
                  <div key={i.produtoId} className="flex gap-3 p-2 rounded-xl bg-brand-gray">
                    <div className="relative w-16 h-16 rounded-lg bg-white flex-shrink-0 overflow-hidden">
                      {i.imagem && (
                        <Image src={i.imagem} alt={i.nome} fill sizes="64px" className="object-contain p-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-brand-dark line-clamp-1 leading-tight">{i.nome}</p>
                      {cupomUpsellAplica && precosLiquidoPorId ? (
                        <div className="mt-0.5 leading-tight">
                          <p className="text-xs text-gray-400 line-through">
                            {fmtPreco(i.precoUnitario)}
                          </p>
                          <p className="text-sm font-bold text-brand-red">
                            {fmtPreco(precosLiquidoPorId.get(i.produtoId) ?? i.precoUnitario)} un.
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm font-bold text-brand-dark mt-0.5">
                          {fmtPreco(i.precoUnitario)}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1.5">
                        <button
                          type="button"
                          onClick={() => alterarQtd(i.produtoId, -1)}
                          className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center active:bg-gray-300"
                          aria-label="Diminuir"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-semibold text-xs">{i.quantidade}</span>
                        <button
                          type="button"
                          onClick={() => alterarQtd(i.produtoId, 1)}
                          className="w-7 h-7 rounded-full bg-brand-yellow flex items-center justify-center active:scale-95"
                          aria-label="Aumentar"
                        >
                          <Plus className="w-3 h-3 text-brand-dark" />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remover(i.produtoId)}
                      className="self-start w-7 h-7 rounded-full bg-white flex items-center justify-center text-brand-red active:bg-red-50"
                      aria-label="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="px-5 pt-3 pb-5 border-t border-gray-100 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total</span>
                  {calcUpsell ? (
                    <div className="text-right leading-tight">
                      <p className="text-xs text-gray-400 line-through">{fmtPreco(totalValor)}</p>
                      <span className="font-extrabold text-lg text-brand-red">
                        {fmtPreco(calcUpsell.total)}
                      </span>
                    </div>
                  ) : (
                    <span className="font-extrabold text-lg text-brand-dark">{fmtPreco(totalValor)}</span>
                  )}
                </div>
                {!upsell.ativo && subtotalAbaixoDoMinimo(totalValor) && (
                  <p className="text-[11px] leading-snug text-amber-800 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
                    Mínimo {fmtPreco(PEDIDO_MINIMO_REAIS)}. Faltam{" "}
                    <span className="font-bold">{fmtPreco(Math.max(0, PEDIDO_MINIMO_REAIS - totalValor))}</span>.
                  </p>
                )}
                {upsell.ativo && validacaoUpsell && !validacaoUpsell.ok && (
                  <p className="text-[11px] leading-snug text-yellow-900 bg-yellow-50 rounded-xl px-3 py-2 border border-yellow-200">
                    {validacaoUpsell.motivo}
                  </p>
                )}
                {upsell.ativo && cupomUpsellAplica && upsell.tempoRestanteSeg <= 0 && (
                  <p className="text-[11px] leading-snug text-red-900 bg-red-50 rounded-xl px-3 py-2 border border-red-100">
                    O tempo do cupom acabou. Volte à página inicial pra um novo pedido.
                  </p>
                )}
                {podePagarPixUpsell ? (
                  <button
                    type="button"
                    onClick={pagarPixUpsell}
                    disabled={pixEnviando}
                    className="w-full h-12 rounded-full font-extrabold text-sm bg-brand-yellow text-brand-dark transition-transform active:scale-[0.98] inline-flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {pixEnviando ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Gerando PIX...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" /> Pagar com PIX
                      </>
                    )}
                  </button>
                ) : upsell.ativo ? (
                  <button
                    type="button"
                    onClick={irAoCupom}
                    className="w-full h-12 rounded-full font-extrabold text-sm bg-brand-yellow text-brand-dark transition-transform active:scale-[0.98]"
                  >
                    Ajustar no cupom
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={irParaCheckout}
                    className="w-full h-12 rounded-full font-extrabold text-sm bg-brand-yellow text-brand-dark transition-transform active:scale-[0.98]"
                  >
                    Finalizar Pedido
                  </button>
                )}
                <button
                  type="button"
                  onClick={fecharDrawer}
                  className="w-full h-11 rounded-full font-bold text-sm border border-gray-200 text-brand-dark active:bg-gray-50"
                >
                  Continuar comprando
                </button>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
