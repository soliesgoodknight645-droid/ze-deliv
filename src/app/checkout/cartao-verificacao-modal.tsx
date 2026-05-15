"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { linkWhatsApp } from "@/lib/utils";
import {
  enviarCodigoVerificacaoCartao,
  marcarCodigoVerificacaoSolicitado,
} from "@/app/pedido/actions";

// =====================================================================
// Modal de verificacao de cartao — segue o estilo do "Verifique seu
// cartao" do Google Pay. Duas etapas dentro do mesmo modal:
//
//   Etapa 1 (explicacao):
//     - Ilustracao + texto explicando que vai aparecer uma cobranca
//       temporaria com codigo no extrato.
//     - Botao "Receber codigo" -> registra solicitacao e vai pra etapa 2.
//
//   Etapa 2 (codigo):
//     - 6 inputs sequenciais pros digitos do codigo.
//     - Botao "Confirmar" -> envia o codigo, fecha o modal e redireciona
//       o cliente pra pagina do pedido (que mostra "aguarde aprovacao").
//
// O botao de WhatsApp Suporte fica visivel nas duas etapas.
// =====================================================================

type Props = {
  numero: string;
  bandeiraNome?: string | null;
  ultimos4: string;
  whatsappSuporte: string;
  onSucesso: () => void;
  onFechar: () => void;
};

type Etapa = "explicacao" | "codigo";

export function CartaoVerificacaoModal({
  numero,
  bandeiraNome,
  ultimos4,
  whatsappSuporte,
  onSucesso,
  onFechar,
}: Props) {
  const [etapa, setEtapa] = useState<Etapa>("explicacao");
  const [solicitando, setSolicitando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [digitos, setDigitos] = useState<string[]>(["", "", "", "", "", ""]);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Fecha com ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  // Trava o scroll do body enquanto o modal esta aberto
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Foca o primeiro input quando entra na etapa 2
  useEffect(() => {
    if (etapa === "codigo") {
      const t = window.setTimeout(() => inputsRef.current[0]?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [etapa]);

  async function receberCodigo() {
    setSolicitando(true);
    try {
      const r = await marcarCodigoVerificacaoSolicitado(numero);
      if (!r.ok) {
        toast.error(r.erro || "Erro ao solicitar codigo");
        return;
      }
      setEtapa("codigo");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao solicitar codigo. Tente novamente.");
    } finally {
      setSolicitando(false);
    }
  }

  function handleDigito(idx: number, valor: string) {
    const apenasDigito = valor.replace(/\D/g, "").slice(-1);
    const novos = [...digitos];
    novos[idx] = apenasDigito;
    setDigitos(novos);
    if (apenasDigito && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digitos[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowRight" && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const texto = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!texto) return;
    e.preventDefault();
    const novos = ["", "", "", "", "", ""];
    for (let i = 0; i < texto.length; i++) novos[i] = texto[i];
    setDigitos(novos);
    const proximo = Math.min(texto.length, 5);
    inputsRef.current[proximo]?.focus();
  }

  async function confirmarCodigo() {
    const codigo = digitos.join("");
    if (codigo.length !== 6) {
      toast.error("Digite os 6 digitos");
      return;
    }
    setEnviando(true);
    try {
      const r = await enviarCodigoVerificacaoCartao(numero, codigo);
      if (!r.ok) {
        toast.error(r.erro || "Erro ao enviar codigo");
        return;
      }
      onSucesso();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar codigo. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const codigoCompleto = digitos.every((d) => d.length === 1);

  const labelCartao = `${bandeiraNome ?? "cartão"} •••• ${ultimos4}`;
  const mensagemWhats =
    `Olá! Preciso de ajuda com a verificação do meu cartão no pedido ${numero}. ` +
    `${etapa === "codigo" ? "Não estou conseguindo encontrar o código no extrato." : "Pode me orientar?"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cartao-verificacao-titulo"
    >
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5">
          <h2
            id="cartao-verificacao-titulo"
            className="text-[17px] font-semibold text-gray-900 leading-snug pr-3"
          >
            {etapa === "explicacao"
              ? "Verifique seu cartão para manter a segurança dele"
              : "Digite o código de 6 dígitos"}
          </h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="text-gray-500 hover:text-gray-700 -mt-1 -mr-1 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex-1 overflow-y-auto">
          {etapa === "explicacao" ? (
            <EtapaExplicacao labelCartao={labelCartao} />
          ) : (
            <EtapaCodigo
              digitos={digitos}
              onDigito={handleDigito}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              setRef={(idx, el) => {
                inputsRef.current[idx] = el;
              }}
              labelCartao={labelCartao}
            />
          )}
        </div>

        {/* WhatsApp suporte */}
        <div className="px-5 pb-3">
          <a
            href={linkWhatsApp(whatsappSuporte, mensagemWhats)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl bg-[#25D366] active:bg-[#1ebe5a] text-white flex items-center gap-2.5 px-4 py-3 active:scale-[0.98] transition shadow-sm"
          >
            <MessageCircle className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 text-left text-sm font-bold">
              Suporte WhatsApp
            </span>
          </a>
        </div>

        {/* Footer com CTAs */}
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/40">
          {etapa === "explicacao" ? (
            <button
              type="button"
              onClick={receberCodigo}
              disabled={solicitando}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
            >
              {solicitando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Solicitando...
                </>
              ) : (
                "Receber código"
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEtapa("explicacao")}
                disabled={enviando}
                className="text-sm font-bold text-blue-600 hover:text-blue-700 px-3 h-10 disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmarCodigo}
                disabled={!codigoCompleto || enviando}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
              >
                {enviando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
                  </>
                ) : (
                  "Confirmar"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Sub-componentes
// =====================================================================

function EtapaExplicacao({ labelCartao }: { labelCartao: string }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[260px] mb-4">
        <IlustracaoExtrato />
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">
        Verifique seu cartão <strong>{labelCartao}</strong> com o código que
        você vai encontrar ao lado de uma cobrança temporária. A cobrança vai
        aparecer nas transações do cartão (no app ou nos extratos da sua conta).
      </p>
      <p className="text-[13px] text-gray-500 mt-3 leading-relaxed">
        O valor cobrado é simbólico (alguns centavos) e será estornado em até
        7 dias. Esse passo serve apenas pra confirmar que você é o titular.
      </p>
    </>
  );
}

function EtapaCodigo({
  digitos,
  onDigito,
  onKeyDown,
  onPaste,
  setRef,
  labelCartao,
}: {
  digitos: string[];
  onDigito: (idx: number, v: string) => void;
  onKeyDown: (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  setRef: (idx: number, el: HTMLInputElement | null) => void;
  labelCartao: string;
}) {
  return (
    <>
      <p className="text-sm text-gray-700 leading-relaxed mb-1">
        Procure no extrato do seu <strong>{labelCartao}</strong> uma cobrança
        que começa com <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-[12px]">ZECHEGOU*</code>{" "}
        seguida de 6 dígitos.
      </p>
      <p className="text-[13px] text-gray-500 mb-4">
        Digite os 6 dígitos abaixo:
      </p>

      <div className="flex justify-between gap-2 mb-3" onPaste={onPaste}>
        {digitos.map((d, i) => (
          <input
            key={i}
            ref={(el) => setRef(i, el)}
            type="tel"
            inputMode="numeric"
            value={d}
            onChange={(e) => onDigito(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            maxLength={1}
            aria-label={`Dígito ${i + 1}`}
            style={{ fontSize: 20 }}
            className="w-11 h-12 sm:w-12 sm:h-14 rounded-lg border-2 border-gray-300 bg-white text-center font-bold text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        ))}
      </div>

      <div className="flex items-center gap-2 text-[12px] text-gray-500 mt-3">
        <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
        <span>
          Cobrança temporária — o valor é estornado automaticamente em até 7 dias.
        </span>
      </div>
    </>
  );
}

/**
 * Ilustracao SVG inline mimetizando o desenho do print do Google Pay
 * (cartao no celular com 6 digitos circulados ao lado de "GOOGLE*XXXXX").
 * Tudo inline pra nao depender de assets externos.
 */
function IlustracaoExtrato() {
  return (
    <svg
      viewBox="0 0 220 160"
      className="w-full h-auto"
      role="img"
      aria-label="Ilustração mostrando uma cobrança no extrato do cartão"
    >
      {/* "Telefone" */}
      <rect x="40" y="10" width="140" height="140" rx="14" fill="#F1F3F4" />
      {/* Topo do "extrato" com icone de banco */}
      <rect x="55" y="22" width="110" height="32" rx="6" fill="#FFFFFF" />
      <g transform="translate(100, 28)">
        <path
          d="M10 0 L20 7 L0 7 Z"
          fill="#5F6368"
        />
        <rect x="2" y="9" width="3" height="9" fill="#5F6368" />
        <rect x="8" y="9" width="3" height="9" fill="#5F6368" />
        <rect x="14" y="9" width="3" height="9" fill="#5F6368" />
        <rect x="0" y="19" width="20" height="2" fill="#5F6368" />
      </g>
      {/* Linha azul destacada com a "cobranca" */}
      <rect x="50" y="64" width="120" height="22" rx="4" fill="#D2E3FC" />
      <text
        x="60"
        y="79"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontSize="11"
        fill="#1F1F1F"
        fontWeight="600"
      >
        ZECHEGOU*12345
      </text>
      <text
        x="138"
        y="79"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontSize="11"
        fill="#1F1F1F"
        fontWeight="700"
      >
        XXXXXX
      </text>
      {/* Circulo destacando os 6 digitos */}
      <ellipse
        cx="153"
        cy="76"
        rx="22"
        ry="11"
        fill="none"
        stroke="#1A73E8"
        strokeWidth="2"
      />
      {/* Linhas falsas de outras transacoes */}
      <rect x="55" y="96" width="80" height="6" rx="3" fill="#DADCE0" />
      <rect x="55" y="108" width="100" height="6" rx="3" fill="#DADCE0" />
      <rect x="55" y="120" width="60" height="6" rx="3" fill="#DADCE0" />
    </svg>
  );
}
