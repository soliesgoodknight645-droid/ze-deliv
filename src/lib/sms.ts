// Cliente para a API Axtron de SMS
// Doc rapida (fornecida pelo cliente):
//   POST https://axtron.io/api/sms/send-campaign
//   Authorization: Bearer <TOKEN>
//   body: { name, message, numbers: ["55DDDNUMERO"] }
//
// Mensagem padrao do checkout (limite 159 chars):
//   "Zé Delivery - <PrimeiroNome> seu pedido está quase completo!"
//
// IMPORTANTE: este modulo so deve ser chamado server-side (nao expor o token).

const AXTRON_URL = "https://axtron.io/api/sms/send-campaign";

export const SMS_LIMITE_DIAS = 30;
export const SMS_MAX_CARACTERES = 159;

export type EnviarSmsInput = {
  nome: string;
  telefone: string;
  campanha?: string;
};

export type EnviarSmsResultado = {
  ok: boolean;
  status?: number;
  resposta?: unknown;
  erro?: string;
  numero?: string;
  mensagem?: string;
};

/** Monta a mensagem com o primeiro nome, garantindo limite de 159 chars. */
export function montarMensagemSms(nome: string): string {
  const primeiro = (nome ?? "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^\p{L}\p{N}\-']/gu, "") || "amigo";
  const msg = `Zé Delivery - ${primeiro} seu pedido está quase completo!`;
  return msg.slice(0, SMS_MAX_CARACTERES);
}

/**
 * Normaliza um telefone BR para o formato exigido pela Axtron: 55 + DDD + numero.
 * Aceita "(11) 99999-9999", "11999999999", "5511999999999". Retorna null se invalido.
 */
export function normalizarTelefoneBR(telefone: string): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) {
    return `55${d}`;
  }
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    return d;
  }
  return null;
}

export async function enviarSmsAxtron({
  nome,
  telefone,
  campanha = "Ze Chegou - checkout",
}: EnviarSmsInput): Promise<EnviarSmsResultado> {
  const token = process.env.AXTRON_SMS_TOKEN;
  if (!token) {
    return { ok: false, erro: "AXTRON_SMS_TOKEN nao configurado" };
  }
  const numero = normalizarTelefoneBR(telefone);
  if (!numero) {
    return { ok: false, erro: "telefone invalido" };
  }
  const message = montarMensagemSms(nome);

  try {
    const r = await fetch(AXTRON_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: campanha,
        message,
        numbers: [numero],
      }),
      cache: "no-store",
    });

    let resposta: unknown = null;
    try {
      resposta = await r.json();
    } catch {
      try {
        resposta = await r.text();
      } catch {
        resposta = null;
      }
    }

    return {
      ok: r.ok,
      status: r.status,
      resposta,
      numero,
      mensagem: message,
    };
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : String(e),
      numero,
      mensagem: message,
    };
  }
}
