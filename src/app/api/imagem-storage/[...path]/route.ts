import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Proxy de imagem do bucket "catalogo" do Supabase Storage.
 *
 * Por que: signed URLs do Supabase as vezes funcionam no servidor (HEAD
 * retorna 200) mas falham no navegador (cache de CDN, token muito longo
 * quebrando Next/Image, CORS, etc). Servir a imagem pelo nosso proprio
 * dominio elimina todas essas variaveis.
 *
 * URL: /api/imagem-storage/<path>
 * Ex:  /api/imagem-storage/produtos/alcatra-em-bifes-500g-123.png
 *
 * Cache: 1 ano + immutable — o filename ja contem timestamp, entao toda
 * foto nova tem URL diferente; nao precisa invalidar.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const partes = params.path ?? [];
  if (partes.length === 0) {
    return new NextResponse("Bad request", { status: 400 });
  }
  // Sanitiza pra evitar path traversal — nao deixa ../ nem segmento vazio
  if (partes.some((p) => p === ".." || p === "" || p.includes("\\"))) {
    return new NextResponse("Invalid path", { status: 400 });
  }
  const path = partes.map((p) => decodeURIComponent(p)).join("/");

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.storage.from("catalogo").download(path);
    if (error || !data) {
      return new NextResponse(`Not found: ${error?.message ?? path}`, { status: 404 });
    }

    const ext = (path.split(".").pop() || "").toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    const buffer = Buffer.from(await data.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        // 1 ano + immutable — filename ja tem timestamp, cada foto eh
        // uma URL diferente, entao nao precisa invalidar.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return new NextResponse(`Server error: ${msg}`, { status: 500 });
  }
}
