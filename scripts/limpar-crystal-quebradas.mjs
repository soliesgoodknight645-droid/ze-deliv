// Limpa imagem_url dos 2 produtos Crystal com URL cloudfront quebrada (403)
// pra cair no fallback de foto local por slug.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const linha of readFileSync(join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const slugs = [
  "agua-mineral-com-gas-crystal-pet-1-5l-980",
  "agua-mineral-natural-sem-gas-crystal-garrafa-1-5l-981",
];

const { data } = await sb
  .from("produtos")
  .select("id, slug, imagem_url")
  .in("slug", slugs);

for (const p of data ?? []) {
  console.log(`${p.slug}`);
  console.log(`  atual: ${p.imagem_url ?? "(null)"}`);
  if (p.imagem_url) {
    const { error } = await sb
      .from("produtos")
      .update({ imagem_url: null })
      .eq("id", p.id);
    console.log(error ? `  ERRO: ${error.message}` : "  -> limpo");
  }
}
