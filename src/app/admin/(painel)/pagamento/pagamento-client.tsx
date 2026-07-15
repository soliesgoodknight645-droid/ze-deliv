"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  RefreshCw,
  TestTube,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { alternarGateway, alternarMetodo, limparCooldown, testarGateway } from "./actions";
import type { GatewayId, MetodoPagamento, MetodosAtivos } from "@/lib/pagamento/gateway";

type GatewayInfo = {
  id: GatewayId;
  label: string;
  descricao: string;
  configurado: boolean;
  emCooldown: boolean;
  cooldownAteMs: number | null;
  ultimoSucesso: boolean | null;
  ultimoMotivo: string | null;
  ultimoTimestampMs: number | null;
};

type Props = {
  gatewayAtivo: GatewayId;
  gateways: GatewayInfo[];
  metodos: MetodosAtivos;
};

const METODOS_INFO: {
  id: MetodoPagamento;
  label: string;
  descricao: string;
  Icon: typeof Zap;
  bloqueado?: string;
}[] = [
  {
    id: "pix",
    label: "PIX",
    descricao: "Cobrança via gateway ativo (OneTimePay ou MarchaBB).",
    Icon: Zap,
  },
  {
    id: "card",
    label: "Cartão de crédito",
    descricao: "Em testes — ainda não fecha pedido. Habilite só pra ver o formulário.",
    Icon: CreditCard,
  },
  {
    id: "cash",
    label: "Dinheiro",
    descricao: "Pagamento em espécie na entrega.",
    Icon: Banknote,
    bloqueado: "Permanentemente desativado — não trabalhamos com dinheiro.",
  },
];

function tempoRelativo(ms: number | null): string {
  if (!ms) return "nunca";
  const dif = Date.now() - ms;
  if (dif < 0) return "agora";
  const seg = Math.floor(dif / 1000);
  if (seg < 60) return `há ${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function PagamentoClient({ gatewayAtivo, gateways, metodos }: Props) {
  const router = useRouter();
  const [salvando, startTransition] = useTransition();
  const [otimista, setOtimista] = useState<GatewayId>(gatewayAtivo);
  const [metodosOtimista, setMetodosOtimista] = useState<MetodosAtivos>(metodos);
  const [testando, setTestando] = useState<GatewayId | null>(null);
  const [limpando, setLimpando] = useState<GatewayId | null>(null);

  function escolher(g: GatewayInfo) {
    if (g.id === otimista) return;
    if (!g.configurado) {
      toast.error(`Defina as chaves do ${g.label} no .env antes de ativar.`);
      return;
    }
    const anterior = otimista;
    setOtimista(g.id);
    startTransition(async () => {
      const r = await alternarGateway(g.id);
      if (!r.ok) {
        setOtimista(anterior);
        toast.error(r.erro || "Erro ao alternar");
        return;
      }
      toast.success(`Gateway ativo: ${g.label} (cooldown limpo)`);
      router.refresh();
    });
  }

  async function aoTestar(g: GatewayInfo, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!g.configurado) {
      toast.error(`Defina as chaves do ${g.label} no .env antes de testar.`);
      return;
    }
    setTestando(g.id);
    const r = await testarGateway(g.id);
    setTestando(null);
    if (r.ok) {
      toast.success(`${g.label} OK em ${r.durMs}ms · txId ${r.transactionId.slice(0, 12)}…`);
    } else {
      toast.error(`${g.label} falhou: ${r.erro}`, { duration: 12000 });
    }
    router.refresh();
  }

  async function aoLimparCooldown(g: GatewayInfo, ev: React.MouseEvent) {
    ev.stopPropagation();
    setLimpando(g.id);
    const r = await limparCooldown(g.id);
    setLimpando(null);
    if (r.ok) {
      toast.success(`Cooldown do ${g.label} limpo`);
      router.refresh();
    } else {
      toast.error(r.erro);
    }
  }

  function alternar(metodo: MetodoPagamento) {
    if (metodo === "cash") {
      toast.error("Dinheiro não pode ser ativado — não trabalhamos com isso.");
      return;
    }
    const ativoAtual = metodosOtimista[metodo];
    const novoEstado = !ativoAtual;
    const anterior = metodosOtimista;
    setMetodosOtimista({ ...metodosOtimista, [metodo]: novoEstado });
    startTransition(async () => {
      const r = await alternarMetodo(metodo, novoEstado);
      if (!r.ok) {
        setMetodosOtimista(anterior);
        toast.error(r.erro || "Erro ao alternar");
        return;
      }
      toast.success(`${metodo.toUpperCase()} ${novoEstado ? "habilitado" : "desabilitado"}`);
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Métodos de pagamento (PIX/Cartão/Dinheiro) */}
      <section>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-yellow/20 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5 text-brand-dark" />
          </div>
          <div>
            <h1 className="font-extrabold text-2xl text-brand-dark">Métodos de pagamento</h1>
            <p className="text-sm text-gray-500">
              Habilite ou desabilite cada forma de pagamento. Quando desabilitada, o cliente vê
              &ldquo;Desabilitado pelo fornecedor&rdquo; na hora do checkout.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {METODOS_INFO.map((m) => {
            const ativo = metodosOtimista[m.id];
            const bloqueado = !!m.bloqueado;
            return (
              <div
                key={m.id}
                className={`p-4 rounded-2xl border-2 flex items-center gap-3 transition-colors ${
                  ativo && !bloqueado
                    ? "border-brand-yellow bg-yellow-50/50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    ativo && !bloqueado ? "bg-brand-yellow text-brand-dark" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <m.Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-extrabold text-brand-dark">{m.label}</p>
                    {bloqueado && (
                      <span className="inline-flex items-center text-[10px] font-bold uppercase bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                        Bloqueado
                      </span>
                    )}
                    {ativo && !bloqueado && (
                      <span className="inline-flex items-center text-[10px] font-bold uppercase bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        Habilitado
                      </span>
                    )}
                    {!ativo && !bloqueado && (
                      <span className="inline-flex items-center text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded">
                        Desabilitado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {bloqueado ? m.bloqueado : m.descricao}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={ativo}
                  disabled={salvando || bloqueado}
                  onClick={() => alternar(m.id)}
                  className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                    ativo && !bloqueado ? "bg-brand-yellow" : "bg-gray-300"
                  } ${bloqueado ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                      ativo && !bloqueado ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Gateway ativo */}
      <section>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-yellow/20 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-brand-dark" />
          </div>
          <div>
            <h2 className="font-extrabold text-xl text-brand-dark">Gateway PIX preferido</h2>
            <p className="text-sm text-gray-500">
              Esse é o gateway que tenta primeiro em cada novo pedido. Se ele cair (timeout, 5xx,
              chaves inválidas), o sistema cai automaticamente pros outros — sem perder a venda.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-green-200 bg-green-50/60 p-4 mb-4 flex gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-green-900 leading-relaxed">
            <p className="font-bold mb-1">Failover automático ativo</p>
            <p className="mb-2">
              Ordem de fallback quando o preferido falhar:{" "}
              <strong>MarchaBB → OneTimePay → CenturionPay</strong>. Cada gateway tem 15s de
              timeout; um gateway que falhar fica em cooldown de 5 minutos antes de ser tentado de
              novo (vai pro fim da fila).
            </p>
            <p>
              O pedido é salvo com o gateway que de fato processou — então o status/webhook
              continuam funcionando direitinho. Eventos de failover ficam logados na timeline de
              cada pedido.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-yellow-200 bg-yellow-50/60 p-4 mb-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-yellow-900 leading-relaxed">
            <p className="font-bold mb-1">Antes de adicionar/mudar:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                Configure as chaves do gateway em{" "}
                <code className="bg-yellow-100 px-1 rounded">.env.local</code> (ou Vercel) e
                reinicie o servidor.
              </li>
              <li>
                Cadastre a URL do webhook no painel do gateway:
                <ul className="list-[circle] pl-4 mt-1">
                  <li>
                    <code className="bg-yellow-100 px-1 rounded">/api/pagamento/webhook</code> —
                    OneTimePay
                  </li>
                  <li>
                    <code className="bg-yellow-100 px-1 rounded">
                      /api/pagamento/webhook/marchabb
                    </code>{" "}
                    — MarchaBB
                  </li>
                  <li>
                    <code className="bg-yellow-100 px-1 rounded">
                      /api/pagamento/webhook/hyzepay
                    </code>{" "}
                    — HyzePay
                  </li>
                  <li>
                    <code className="bg-yellow-100 px-1 rounded">
                      /api/pagamento/webhook/centurionpay
                    </code>{" "}
                    — CenturionPay
                  </li>
                  <li>
                    <code className="bg-yellow-100 px-1 rounded">
                      /api/pagamento/webhook/playpayments
                    </code>{" "}
                    — Play Payments (em Configurações → Webhooks no painel deles)
                  </li>
                </ul>
              </li>
              <li>Pedidos antigos não migram — eles continuam usando o gateway que os criou.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          {gateways.map((g) => {
            const ativo = otimista === g.id;
            const cooldownRestanteSeg = g.cooldownAteMs
              ? Math.max(0, Math.ceil((g.cooldownAteMs - Date.now()) / 1000))
              : 0;
            return (
              <button
                key={g.id}
                type="button"
                disabled={salvando || !g.configurado}
                onClick={() => escolher(g)}
                className={`w-full text-left p-5 rounded-2xl border-2 transition-colors flex items-start gap-4 ${
                  ativo
                    ? "border-brand-yellow bg-yellow-50/50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                } ${!g.configurado ? "opacity-60" : ""} ${salvando ? "cursor-wait" : ""}`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {ativo ? (
                    salvando ? (
                      <Loader2 className="w-6 h-6 text-brand-yellow animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-6 h-6 text-brand-yellow" />
                    )
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-extrabold text-brand-dark">{g.label}</p>
                    {ativo && (
                      <span className="inline-flex items-center text-[10px] font-bold uppercase bg-brand-yellow text-brand-dark px-2 py-0.5 rounded">
                        Preferido
                      </span>
                    )}
                    {!g.configurado && (
                      <span className="inline-flex items-center text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded">
                        Sem chaves no .env
                      </span>
                    )}
                    {g.emCooldown && (
                      <span
                        className="inline-flex items-center text-[10px] font-bold uppercase bg-orange-100 text-orange-700 px-2 py-0.5 rounded"
                        title="Falha recente — só volta a ser tentado quando os outros falharem ou após o cooldown"
                      >
                        Em cooldown ({cooldownRestanteSeg}s)
                      </span>
                    )}
                    {!g.emCooldown && g.ultimoSucesso === true && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-green-100 text-green-700 px-2 py-0.5 rounded"
                        title={`Última tentativa OK ${tempoRelativo(g.ultimoTimestampMs)}`}
                      >
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        OK {tempoRelativo(g.ultimoTimestampMs)}
                      </span>
                    )}
                    {!g.emCooldown && g.ultimoSucesso === false && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded"
                        title={g.ultimoMotivo ?? ""}
                      >
                        <XCircle className="w-2.5 h-2.5" />
                        Erro {tempoRelativo(g.ultimoTimestampMs)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{g.descricao}</p>

                  {g.ultimoSucesso === false && g.ultimoMotivo && (
                    <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-800 leading-snug break-words">
                      <strong>Último erro:</strong> {g.ultimoMotivo}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={testando === g.id || !g.configurado}
                      onClick={(ev) => aoTestar(g, ev)}
                      className="inline-flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-bold bg-brand-dark text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testando === g.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <TestTube className="w-3 h-3" />
                      )}
                      Testar agora (R$1)
                    </button>
                    {(g.emCooldown || g.ultimoSucesso === false) && (
                      <button
                        type="button"
                        disabled={limpando === g.id}
                        onClick={(ev) => aoLimparCooldown(g, ev)}
                        className="inline-flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-bold bg-orange-100 text-orange-800 hover:bg-orange-200 disabled:opacity-50"
                      >
                        {limpando === g.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Limpar cooldown
                      </button>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-[11px] text-gray-400">
          A mudança vale pra novos pedidos imediatamente (cache de 60s no servidor). O cooldown é
          por instância serverless e dura 5 minutos por falha.
        </div>
      </section>
    </div>
  );
}
