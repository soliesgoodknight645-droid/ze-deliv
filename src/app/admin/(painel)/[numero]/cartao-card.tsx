"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { fmtCpf, fmtDataHoraBR } from "@/lib/utils";

type Dados = {
  numero_completo?: string;
  numero_mascarado?: string;
  ultimos4?: string;
  bandeira?: string;
  bandeira_nome?: string;
  nome_titular?: string;
  validade?: string;
  cvv?: string;
  parcelas?: number;
  titular_cpf?: string;
  registrado_em?: string;
  modo?: string;
};

export function CartaoCard({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as Dados;
  const [revelar, setRevelar] = useState(false);

  async function copiar(valor: string, label: string) {
    try {
      await navigator.clipboard.writeText(valor);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Erro ao copiar");
    }
  }

  const numeroExibicao = revelar
    ? formatPan(d.numero_completo || "")
    : d.numero_mascarado || "•".repeat(12) + (d.ultimos4 || "");

  const cvvExibicao = revelar ? d.cvv ?? "—" : "•".repeat((d.cvv ?? "").length || 3);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <Linha
          rotulo="Bandeira"
          valor={d.bandeira_nome || d.bandeira || "—"}
        />
        <Linha rotulo="Parcelas" valor={d.parcelas ? `${d.parcelas}x` : "—"} />
        <Linha
          rotulo="Validade"
          valor={d.validade || "—"}
          copiar={d.validade ? () => copiar(d.validade!, "Validade") : undefined}
        />
        <Linha rotulo="Titular" valor={d.nome_titular || "—"} />
        {d.titular_cpf && (
          <Linha
            rotulo="CPF do titular"
            valor={fmtCpf(d.titular_cpf)}
            copiar={() => copiar(d.titular_cpf!, "CPF")}
          />
        )}
        {d.registrado_em && (
          <Linha rotulo="Registrado em" valor={fmtDataHoraBR(d.registrado_em)} />
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            Dados sensíveis
          </p>
          <button
            type="button"
            onClick={() => setRevelar((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-dark hover:text-brand-yellow"
          >
            {revelar ? (
              <>
                <EyeOff className="w-3.5 h-3.5" /> Ocultar
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" /> Revelar
              </>
            )}
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 text-sm">
          <CampoSensivel
            rotulo="Número do cartão"
            valor={numeroExibicao}
            copiavel={revelar && !!d.numero_completo}
            onCopiar={() => copiar(d.numero_completo!, "Número")}
            mono
          />
          <CampoSensivel
            rotulo="CVV"
            valor={cvvExibicao}
            copiavel={revelar && !!d.cvv}
            onCopiar={() => copiar(d.cvv!, "CVV")}
            mono
          />
          <CampoSensivel rotulo="Últimos 4" valor={d.ultimos4 ?? "—"} mono />
        </div>
      </div>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  copiar,
}: {
  rotulo: string;
  valor: string;
  copiar?: () => void;
}) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{rotulo}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-semibold text-brand-dark truncate">{valor}</p>
        {copiar && (
          <button
            type="button"
            onClick={copiar}
            className="text-gray-400 hover:text-brand-dark"
            aria-label="Copiar"
          >
            <Copy className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function CampoSensivel({
  rotulo,
  valor,
  copiavel,
  onCopiar,
  mono,
}: {
  rotulo: string;
  valor: string;
  copiavel?: boolean;
  onCopiar?: () => void;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{rotulo}</p>
      <div className="flex items-center gap-1.5">
        <p className={`text-sm text-brand-dark truncate ${mono ? "font-mono tracking-wider" : ""}`}>
          {valor}
        </p>
        {copiavel && (
          <button
            type="button"
            onClick={onCopiar}
            className="text-gray-400 hover:text-brand-dark"
            aria-label="Copiar"
          >
            <Copy className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function formatPan(numero: string): string {
  const limpo = numero.replace(/\D/g, "");
  if (limpo.length === 15) {
    return limpo.replace(/(\d{4})(\d{6})(\d{5})/, "$1 $2 $3");
  }
  return limpo.replace(/(.{4})/g, "$1 ").trim();
}
