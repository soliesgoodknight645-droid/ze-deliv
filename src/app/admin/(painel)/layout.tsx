import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, CreditCard, LayoutGrid, LogOut, Package, Settings, ShieldCheck, ShoppingBag, UserCircle } from "lucide-react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminPainelLayout({ children }: { children: React.ReactNode }) {
  const sb = createSupabaseServer();
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect("/admin/login");
  }

  const admin = createSupabaseAdmin();
  const { data: ehAdmin } = await admin
    .from("app_admins")
    .select("email")
    .ilike("email", user.email!)
    .maybeSingle();

  if (!ehAdmin) {
    await sb.auth.signOut();
    redirect("/admin/login?erro=nao_autorizado");
  }

  return (
    <div className="min-h-screen bg-brand-gray">
      <header className="bg-brand-dark text-white sticky top-0 z-30">
        <div className="max-w-screen-lg mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2 font-extrabold">
            <ShieldCheck className="w-5 h-5 text-brand-yellow" />
            <span>Admin · Zé Chegou 24h</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold hover:bg-white/10"
            >
              <Package className="w-3.5 h-3.5" /> Pedidos
            </Link>
            <Link
              href="/admin/atribuicao"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold hover:bg-white/10"
            >
              <BarChart3 className="w-3.5 h-3.5" /> Atribuição
            </Link>
            <Link
              href="/admin/produtos"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold hover:bg-white/10"
            >
              <ShoppingBag className="w-3.5 h-3.5" /> Produtos
            </Link>
            <Link
              href="/admin/categorias"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold hover:bg-white/10"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Categorias
            </Link>
            <Link
              href="/admin/pagamento"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold hover:bg-white/10"
            >
              <CreditCard className="w-3.5 h-3.5" /> Pagamento
            </Link>
            <Link
              href="/admin/configuracoes"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold hover:bg-white/10"
            >
              <Settings className="w-3.5 h-3.5" /> Configurações
            </Link>
            <Link
              href="/admin/conta"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold hover:bg-white/10"
            >
              <UserCircle className="w-3.5 h-3.5" /> Conta
            </Link>
            <span className="text-xs text-white/60 px-2 hidden lg:inline">{user.email}</span>
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold hover:bg-white/10"
              >
                <LogOut className="w-3.5 h-3.5" /> Sair
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="max-w-screen-lg mx-auto px-4 py-6">{children}</div>
    </div>
  );
}
