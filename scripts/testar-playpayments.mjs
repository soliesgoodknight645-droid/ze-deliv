// Teste end-to-end da Play Payments: cria uma cobranca PIX real de R$0,50 e
// consulta o status. Confirma que a secret key eh valida, que nosso formato
// de request eh aceito e que parseamos a resposta certinho.
//
// Uso: node scripts/testar-playpayments.mjs
// Le PLAYPAYMENTS_SECRET_KEY do .env.local automaticamente.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function lerEnvLocal() {
  const txt = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = lerEnvLocal();
const SECRET = env.PLAYPAYMENTS_SECRET_KEY;
const BASE = env.PLAYPAYMENTS_API_URL || "https://app.playpayments.com.br/api";

if (!SECRET) {
  console.error("PLAYPAYMENTS_SECRET_KEY nao encontrada no .env.local");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${SECRET}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function criar(rotulo, body) {
  const r = await fetch(`${BASE}/pix`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text.slice(0, 300) };
  }
  const ok = r.ok && data.transaction_id;
  console.log(`\n== ${rotulo} ==`);
  console.log("HTTP", r.status, ok ? "OK" : "FALHOU");
  if (ok) {
    console.log("transaction_id:", data.transaction_id);
    console.log("pix_code:", String(data.pix_code || data.qr_code || "").slice(0, 40) + "...");
  } else {
    console.log(JSON.stringify(data).slice(0, 500));
  }
  return ok ? data : null;
}

async function main() {
  const meuExternalId = `ZC-TESTE-${Date.now()}`;
  const body = {
    payment_method: "pix",
    amount: 7.5,
    customer: {
      name: "Joao da Silva",
      email: "joao.teste@gmail.com",
      document: "24843803480",
      phone: "11987654321",
    },
    external_id: meuExternalId,
    title: "Teste mapeamento external_id",
    expires_in: 3600,
  };

  console.log("external_id ENVIADO:", meuExternalId);

  const r = await fetch(`${BASE}/pix`, { method: "POST", headers, body: JSON.stringify(body) });
  const criarJson = JSON.parse(await r.text());
  console.log("\n== CRIAR (resposta completa) ==");
  console.log("HTTP", r.status);
  console.log(JSON.stringify(criarJson, null, 2));

  const txId = criarJson.transaction_id;
  if (!txId) return;

  const rg = await fetch(`${BASE}/pix/${encodeURIComponent(txId)}`, { headers });
  console.log("\n== GET /pix/{id} (completa) ==");
  console.log("HTTP", rg.status);
  console.log(JSON.stringify(JSON.parse(await rg.text()), null, 2));

  const rs = await fetch(`${BASE}/pix/status/${encodeURIComponent(txId)}`, { headers });
  console.log("\n== GET /pix/status/{id} (completa) ==");
  console.log("HTTP", rs.status);
  console.log(JSON.stringify(JSON.parse(await rs.text()), null, 2));
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
