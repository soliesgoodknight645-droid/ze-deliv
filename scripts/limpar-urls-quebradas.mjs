// Limpa imagem_url de produtos cuja URL externa quebrou (HEAD nao-2xx),
// fazendo o site cair no fallback de imagem local por slug.
// Uso: node scripts/limpar-urls-quebradas.mjs [--dry]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry");

// le .env.local na mao (sem dotenv)
const env = {};
for (const linha of readFileSync(join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: produtos, error } = await sb
  .from("produtos")
  .select("id, slug, imagem_url")
  .not("imagem_url", "is", null)
  .like("imagem_url", "http%");

if (error) {
  console.error("Erro ao listar:", error.message);
  process.exit(1);
}

console.log(`${produtos.length} produtos com URL externa. Validando...\n`);

let limpos = 0;
for (const p of produtos) {
  let ok = false;
  try {
    const r = await fetch(p.imagem_url, { method: "HEAD" });
    ok = r.ok;
    // alguns CDNs nao suportam HEAD direito — confirma com GET se falhou
    if (!ok) {
      const r2 = await fetch(p.imagem_url, { method: "GET" });
      ok = r2.ok && (r2.headers.get("content-type") ?? "").startsWith("image/");
    }
  } catch {
    ok = false;
  }
  if (ok) continue;

  console.log(`QUEBRADA: ${p.slug}`);
  console.log(`  ${p.imagem_url.slice(0, 120)}`);
  if (!dry) {
    const { error: e2 } = await sb
      .from("produtos")
      .update({ imagem_url: null })
      .eq("id", p.id);
    if (e2) {
      console.log(`  ERRO ao limpar: ${e2.message}`);
    } else {
      console.log("  -> imagem_url limpo (vai usar foto local)");
      limpos++;
    }
  }
}

console.log(`\n${dry ? "[DRY RUN] " : ""}Total limpos: ${limpos}`);
