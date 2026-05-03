// Regras do cupom da roleta de upsell pos-pagamento.
// Quando o cliente paga o primeiro pedido, ele ganha 50% OFF para fazer um
// "segundo pedido relampago" que vai junto com o primeiro pra entrega unica.

export const CUPOM_UPSELL = {
  CODIGO: "ZE50",
  DESCONTO_PERCENT: 50,
  VALOR_MINIMO: 100,   // pedido upsell precisa atingir R$ 100,00
  VALOR_MAXIMO: 999,   // cupom nao se aplica a partir de R$ 1000,00
  DURACAO_MS: 5 * 60 * 1000, // 5 minutos
} as const;

export type ResultadoCupom = {
  desconto: number;
  total: number;
  subtotal: number;
};

export function calcularDescontoUpsell(subtotal: number): ResultadoCupom {
  const desconto = Math.round(subtotal * (CUPOM_UPSELL.DESCONTO_PERCENT / 100) * 100) / 100;
  return {
    subtotal,
    desconto,
    total: Math.max(0, Math.round((subtotal - desconto) * 100) / 100),
  };
}

export type ValidacaoCupom =
  | { ok: true }
  | { ok: false; motivo: string; tipo: "abaixo" | "acima" };

export function validarSubtotalUpsell(subtotal: number): ValidacaoCupom {
  if (subtotal < CUPOM_UPSELL.VALOR_MINIMO) {
    return {
      ok: false,
      tipo: "abaixo",
      motivo: `Adicione mais R$ ${(CUPOM_UPSELL.VALOR_MINIMO - subtotal)
        .toFixed(2)
        .replace(".", ",")} para destravar o cupom`,
    };
  }
  if (subtotal > CUPOM_UPSELL.VALOR_MAXIMO) {
    return {
      ok: false,
      tipo: "acima",
      motivo: `Cupom nao se aplica em pedidos acima de R$ ${CUPOM_UPSELL.VALOR_MAXIMO},00`,
    };
  }
  return { ok: true };
}
