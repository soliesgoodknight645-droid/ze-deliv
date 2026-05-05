/** Estados em que o pedido já foi quitado / entrou na operação (não deve voltar ao PIX). */
export function pedidoStatusEhPosPagamento(status: string): boolean {
  return (
    status === "pago" ||
    status === "em_separacao" ||
    status === "em_entrega" ||
    status === "concluido"
  );
}
