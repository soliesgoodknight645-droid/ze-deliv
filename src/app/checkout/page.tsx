import { obterMetodosAtivos } from "@/lib/pagamento/gateway";
import { obterWhatsappSuporte } from "@/lib/config-app";
import { CheckoutClient } from "./checkout-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Checkout — Zé Chegou 24h",
};

export default async function CheckoutPage() {
  const [metodos, whatsappSuporte] = await Promise.all([
    obterMetodosAtivos(),
    obterWhatsappSuporte(),
  ]);
  return <CheckoutClient metodosAtivos={metodos} whatsappSuporte={whatsappSuporte} />;
}
