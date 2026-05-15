import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, type ReactNode } from "react";
import { Library, BookOpen, BookMarked, Users, ClipboardList, BarChart3, LogOut, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function NavItem({ to, icon: Icon, children }: { to: string; icon: any; children: ReactNode }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to !== "/dashboard" && loc.pathname.startsWith(to));
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-gradient-gold text-primary font-medium" : "text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}

export function AppShell() {
  const { user, profile, role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Memuat...</div>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col bg-gradient-hero p-5 text-primary-foreground md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2">
          <Library className="h-6 w-6 text-gold" />
          <span className="font-display text-lg">Pustaka Sekolah</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          <NavItem to="/dashboard" icon={BarChart3}>Dashboard</NavItem>
          <NavItem to="/books" icon={BookOpen}>Katalog Buku</NavItem>
          <NavItem to="/loans" icon={BookMarked}>{role === "teacher" ? "Semua Peminjaman" : "Peminjaman Saya"}</NavItem>
          {role === "teacher" && (
            <>
              <div className="mt-4 px-3 text-xs uppercase tracking-widest text-gold/70">Guru</div>
              <NavItem to="/manage/books" icon={ClipboardList}>Kelola Buku</NavItem>
              <NavItem to="/manage/students" icon={Users}>Data Siswa</NavItem>
            </>
          )}
        </nav>
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            {role === "teacher" ? <GraduationCap className="h-4 w-4 text-gold" /> : <BookOpen className="h-4 w-4 text-gold" />}
            <div className="text-sm">
              <div className="font-medium">{profile?.full_name || user.email}</div>
              <div className="text-xs text-primary-foreground/60 capitalize">{role === "teacher" ? "Guru" : "Siswa"}{profile?.class_name ? ` · ${profile.class_name}` : ""}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="mt-3 w-full justify-start text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
            onClick={async () => { await signOut(); navigate({ to: "/" }); }}>
            <LogOut className="mr-2 h-4 w-4" /> Keluar
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="md:hidden flex items-center justify-between border-b bg-card p-4">
          <Link to="/" className="flex items-center gap-2"><Library className="h-5 w-5" /><span className="font-display">Pustaka</span></Link>
          <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate({ to: "/" }); }}>Keluar</Button>
        </div>
        <div className="p-6 md:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}