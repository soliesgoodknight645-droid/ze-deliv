import {
  GATEWAYS_DISPONIVEIS,
  lerStatusUltimoGateways,
  obterGatewayAtivo,
  obterMetodosAtivos,
  obterStatusFailover,
} from "@/lib/pagamento/gateway";
import { PagamentoClient } from "./pagamento-client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin · Pagamentos — Zé Chegou 24h",
  robots: { index: false },
};

export default async function PagamentoPage() {
  const [ativo, metodos, ultimosResultados] = await Promise.all([
    obterGatewayAtivo(),
    obterMetodosAtivos(),
    lerStatusUltimoGateways(),
  ]);
  const statusFailover = obterStatusFailover();

  // Detecta se as chaves de cada gateway estao configuradas
  const onetimepayConfigurado = !!(
    process.env.ONETIMEPAY_PUBLIC_KEY && process.env.ONETIMEPAY_SECRET_KEY
  );
  const marchabbConfigurado = !!(
    process.env.MARCHABB_PUBLIC_KEY && process.env.MARCHABB_SECRET_KEY
  );
  const hyzepayConfigurado = !!(
    process.env.HYZEPAY_PUBLIC_KEY && process.env.HYZEPAY_SECRET_KEY
  );
  const centurionpayConfigurado = !!(
    process.env.CENTURIONPAY_SECRET_KEY && process.env.CENTURIONPAY_COMPANY_ID
  );
  // Promst nao usa chave secreta — so um user_id, que tem default sandbox
  // hardcoded (8758220378). Entao esta sempre "configurado", mesmo sem env.
  const promstConfigurado = true;
  const playpaymentsConfigurado = !!process.env.PLAYPAYMENTS_SECRET_KEY;

  const configPorId: Record<string, boolean> = {
    onetimepay: onetimepayConfigurado,
    marchabb: marchabbConfigurado,
    hyzepay: hyzepayConfigurado,
    centurionpay: centurionpayConfigurado,
    promst: promstConfigurado,
    playpayments: playpaymentsConfigurado,
  };

  const statusPorId = new Map(statusFailover.map((s) => [s.gateway, s]));
  const ultimoPorId = new Map(ultimosResultados.map((s) => [s.gateway, s]));

  const gateways = GATEWAYS_DISPONIVEIS.map((g) => {
    const st = statusPorId.get(g.id);
    const ult = ultimoPorId.get(g.id);
    return {
      ...g,
      configurado: configPorId[g.id] ?? false,
      emCooldown: st?.emCooldown ?? false,
      cooldownAteMs: st?.cooldownAteMs ?? null,
      ultimoSucesso: ult?.sucesso ?? null,
      ultimoMotivo: ult?.motivo ?? null,
      ultimoTimestampMs: ult?.timestampMs ?? null,
    };
  });

  return <PagamentoClient gatewayAtivo={ativo} gateways={gateways} metodos={metodos} />;
}
