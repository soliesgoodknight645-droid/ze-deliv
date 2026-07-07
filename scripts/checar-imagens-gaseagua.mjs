// Checa se todas as imagens da pagina /gaseagua carregam.
// Uso: node scripts/checar-imagens-gaseagua.mjs
const BASE = "http://localhost:3000";

const html = await (await fetch(`${BASE}/gaseagua`)).text();

// Extrai srcs de <img> (Next/Image gera src e srcset)
const srcs = new Set();
for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
  srcs.add(m[1].replace(/&amp;/g, "&"));
}

// Nomes dos produtos (alt) pra dar contexto
const altPorSrc = new Map();
for (const m of html.matchAll(/<img[^>]+alt="([^"]*)"[^>]*src="([^"]+)"/g)) {
  altPorSrc.set(m[2].replace(/&amp;/g, "&"), m[1]);
}
for (const m of html.matchAll(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/g)) {
  altPorSrc.set(m[1].replace(/&amp;/g, "&"), m[2]);
}

console.log(`Total de <img> unicos: ${srcs.size}\n`);

let ok = 0;
let quebradas = 0;
for (const src of srcs) {
  const url = src.startsWith("http") ? src : `${BASE}${src}`;
  try {
    const r = await fetch(url, { method: "GET" });
    const tipo = r.headers.get("content-type") ?? "?";
    const ehImagem = tipo.startsWith("image/");
    if (r.ok && ehImagem) {
      ok++;
      console.log(`OK   ${r.status} ${tipo.padEnd(12)} ${altPorSrc.get(src) ?? ""} ${src.slice(0, 110)}`);
    } else {
      quebradas++;
      console.log(`FAIL ${r.status} ${tipo.padEnd(12)} ${altPorSrc.get(src) ?? ""} ${src.slice(0, 160)}`);
    }
  } catch (e) {
    quebradas++;
    console.log(`ERR  ${e.message} ${src.slice(0, 160)}`);
  }
}

console.log(`\nResumo: ${ok} OK, ${quebradas} quebradas`);
