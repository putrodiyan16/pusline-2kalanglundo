import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, type ReactNode } from "react";
import { Library, BookOpen, BookMarked, Users, ClipboardList, BarChart3, LogOut, GraduationCap, ScanLine, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function NavItem({ to, icon: Icon, children, onClick }: { to: string; icon: any; children: ReactNode; onClick?: () => void }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to !== "/dashboard" && loc.pathname.startsWith(to));
  return (
    <Link
      to={to}
      onClick={onClick}
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Memuat...</div>;
  }

  const handleMobileNavClick = () => {
    setMobileMenuOpen(false);
  };

  const renderNav = () => (
    <nav className="flex flex-1 flex-col gap-1">
      <NavItem to="/dashboard" icon={BarChart3} onClick={handleMobileNavClick}>
        Dashboard
      </NavItem>
      <NavItem to="/books" icon={BookOpen} onClick={handleMobileNavClick}>
        Katalog Buku
      </NavItem>
      <NavItem to="/loans" icon={BookMarked} onClick={handleMobileNavClick}>
        {role === "teacher" ? "Semua Peminjaman" : "Peminjaman Saya"}
      </NavItem>
      {role === "teacher" && (
        <>
          <div className="mt-4 px-3 text-xs uppercase tracking-widest text-gold/70">Guru</div>
          <NavItem to="/scan" icon={ScanLine} onClick={handleMobileNavClick}>
            Pindai QR
          </NavItem>
          <NavItem to="/manage/books" icon={ClipboardList} onClick={handleMobileNavClick}>
            Kelola Buku
          </NavItem>
          <NavItem to="/manage/students" icon={Users} onClick={handleMobileNavClick}>
            Data Siswa
          </NavItem>
        </>
      )}
    </nav>
  );

  const renderUserCard = () => (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2">
        {role === "teacher" ? (
          <GraduationCap className="h-4 w-4 text-gold" />
        ) : (
          <BookOpen className="h-4 w-4 text-gold" />
        )}
        <div className="text-sm">
          <div className="font-medium">{profile?.full_name || user.email}</div>
          <div className="text-xs text-primary-foreground/60 capitalize">
            {role === "teacher" ? "Guru" : "Siswa"}
            {profile?.class_name ? ` · ${profile.class_name}` : ""}
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 w-full justify-start text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
        onClick={async () => {
          await signOut();
          navigate({ to: "/" });
        }}
      >
        <LogOut className="mr-2 h-4 w-4" /> Keluar
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col bg-gradient-hero p-5 text-primary-foreground md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2">
          <Library className="h-6 w-6 text-gold" />
          <span className="font-display text-lg">Pustaka Sekolah</span>
        </Link>
        {renderNav()}
        {renderUserCard()}
      </aside>

      <main className="flex-1 overflow-x-hidden">
        {/* Mobile Top Bar */}
        <div className="sticky top-0 z-40 md:hidden flex items-center justify-between border-b bg-card p-4">
          <Link to="/" className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            <span className="font-display">Pustaka</span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-0"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop - z-30, hanya untuk close menu */}
            <div
              className="fixed inset-0 top-[57px] z-30 bg-black/50 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer - z-50, di atas backdrop agar clickable */}
            <aside className="fixed left-0 top-[57px] z-50 h-[calc(100vh-57px)] w-64 bg-gradient-hero p-5 text-primary-foreground overflow-y-auto md:hidden">
              <Link to="/" className="mb-8 flex items-center gap-2" onClick={handleMobileNavClick}>
                <Library className="h-6 w-6 text-gold" />
                <span className="font-display text-lg">Pustaka Sekolah</span>
              </Link>
              {renderNav()}
              {renderUserCard()}
            </aside>
          </>
        )}

        {/* Main Content */}
        <div className="p-6 md:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
