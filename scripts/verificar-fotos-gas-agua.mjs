// Confere: imagem_url no banco + arquivo no bucket + HEAD na URL publica.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raiz = join(__dirname, "..");
const BUCKET = "catalogo";

const SLUGS = [
  "botijao-13kg-p13",
  "botijao-13kg-p13-liquigas",
  "botijao-13kg-p13-copagaz",
  "botijao-13kg-p13-consigaz",
  "botijao-13kg-p13-servgas",
  "botijao-13kg-p13-fogas",
  "botijao-de-gas-5kg-p5",
  "garrafao-20l-ibira",
  "garrafao-20l-lindoya",
  "garrafao-20l-purissima",
  "agua-galao-20l-309",
  "galao-de-agua-mineral-20l-gelado-713",
];

function carregarEnv() {
  const txt = readFileSync(join(raiz, ".env.local"), "utf8");
  for (const linha of txt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha.trim());
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
carregarEnv();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: prods } = await sb
  .from("produtos")
  .select("slug, imagem_url")
  .in("slug", SLUGS);

for (const slug of SLUGS) {
  const p = prods.find((x) => x.slug === slug);
  const path = `produtos/${slug}.png`;
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  let head = "?";
  try {
    const r = await fetch(pub.publicUrl, { method: "HEAD" });
    head = r.status;
  } catch (e) {
    head = `ERRO ${e.message}`;
  }
  console.log(`${slug}\n  db=${p?.imagem_url}\n  pub HEAD=${head}\n`);
}
