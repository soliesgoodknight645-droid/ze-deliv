import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  enviarSmsAxtron,
  montarMensagemSms,
  normalizarTelefoneBR,
  SMS_LIMITE_DIAS,
} from "@/lib/sms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  cpf?: string;
  nome?: string;
  telefone?: string;
};

function limparCpf(cpf?: string): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return null;
  // rejeita repetidos triviais (00000000000 etc)
  if (/^(\d)\1+$/.test(d)) return null;
  return d;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, erro: "json invalido" }, { status: 400 });
  }

  const cpf = limparCpf(body.cpf);
  const nome = (body.nome ?? "").trim();
  const telefoneRaw = (body.telefone ?? "").trim();

  if (!cpf) {
    return NextResponse.json({ ok: false, erro: "cpf invalido" }, { status: 400 });
  }
  if (!nome) {
    return NextResponse.json({ ok: false, erro: "nome obrigatorio" }, { status: 400 });
  }
  if (!normalizarTelefoneBR(telefoneRaw)) {
    return NextResponse.json({ ok: false, erro: "telefone invalido" }, { status: 400 });
  }

  const sb = createSupabaseAdmin();

  // Limite: 1 SMS por CPF nos ultimos N dias
  const limite = new Date(
    Date.now() - SMS_LIMITE_DIAS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: ja, error: errLeitura } = await sb
    .from("sms_enviados")
    .select("id, criado_em, status")
    .eq("cpf", cpf)
    .gte("criado_em", limite)
    .order("criado_em", { ascending: false })
    .limit(1);

  if (errLeitura) {
    console.error("[sms] erro consultando historico", errLeitura);
    return NextResponse.json(
      { ok: false, erro: "erro consultando historico" },
      { status: 500 },
    );
  }

  // Ja recebeu um envio bem-sucedido recentemente — ignora silenciosamente
  const recente = ja?.[0];
  if (recente && recente.status === "enviado") {
    return NextResponse.json({
      ok: true,
      ignorado: true,
      motivo: `cpf ja recebeu sms ha menos de ${SMS_LIMITE_DIAS} dias`,
    });
  }

  const resultado = await enviarSmsAxtron({ nome, telefone: telefoneRaw });
  const mensagem = montarMensagemSms(nome);

  await sb.from("sms_enviados").insert({
    cpf,
    nome,
    telefone: resultado.numero ?? telefoneRaw,
    mensagem,
    status: resultado.ok ? "enviado" : "falha",
    resposta_api: {
      status: resultado.status ?? null,
      resposta: resultado.resposta ?? null,
      erro: resultado.erro ?? null,
    } as Record<string, unknown>,
  });

  if (!resultado.ok) {
    console.error("[sms] envio falhou", {
      status: resultado.status,
      erro: resultado.erro,
      resposta: resultado.resposta,
    });
    return NextResponse.json(
      { ok: false, status: resultado.status ?? 0, erro: resultado.erro ?? "falha no envio" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    enviado: true,
    status: resultado.status,
  });
}
