import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BookOpen, BookMarked, Clock, CheckCircle2, Users, ScanLine } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { QRCodeCanvas } from "qrcode.react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card-soft">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-gold text-primary"><Icon className="h-4 w-4" /></div>
      </div>
      <div className="mt-3 font-display text-3xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const { role, profile, user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", role, user?.id],
    queryFn: async () => {
      if (role === "teacher") {
        // 🎯 Fix: Hitung buku yang sedang dipinjam dengan status "approved"
        const [{ count: books }, { count: pending }, { count: borrowed }, { count: students }] = await Promise.all([
          supabase.from("books").select("*", { count: "exact", head: true }),
          supabase.from("loans").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("loans").select("*", { count: "exact", head: true }).eq("status", "approved"),
          supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "student"),
        ]);
        return { books, pending, borrowed, students };
      } else {
        // 🎯 Fix: Hitung buku yang sedang dipinjam siswa dengan status "approved"
        const [{ count: borrowed }, { count: pending }, { count: returned }] = await Promise.all([
          supabase.from("loans").select("*", { count: "exact", head: true }).eq("user_id", user!.id).eq("status", "approved"),
          supabase.from("loans").select("*", { count: "exact", head: true }).eq("user_id", user!.id).eq("status", "pending"),
          supabase.from("loans").select("*", { count: "exact", head: true }).eq("user_id", user!.id).eq("status", "returned"),
        ]);
        return { borrowed, pending, returned };
      }
    },
    enabled: !!role && !!user,
  });

  return (
    <div>
      <header className="mb-8">
        <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Halo, {profile?.full_name || "Pengguna"}</span>
        <h1 className="font-display text-4xl">{role === "teacher" ? "Dashboard Guru" : "Beranda Siswa"}</h1>
        <p className="mt-1 text-muted-foreground">{role === "teacher" ? "Ringkasan perpustakaan dan aktivitas peminjaman." : "Pantau peminjaman dan jelajahi koleksi terbaru."}</p>
      </header>

      {role === "teacher" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={BookOpen} label="Total Buku" value={stats?.books ?? "—"} />
          <StatCard icon={Clock} label="Menunggu Persetujuan" value={stats?.pending ?? "—"} />
          <StatCard icon={BookMarked} label="Sedang Dipinjam" value={stats?.borrowed ?? "—"} />
          <StatCard icon={Users} label="Total Siswa" value={stats?.students ?? "—"} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={Clock} label="Menunggu" value={stats?.pending ?? "—"} hint="Pengajuan belum disetujui" />
          <StatCard icon={BookMarked} label="Sedang Dipinjam" value={stats?.borrowed ?? "—"} />
          <StatCard icon={CheckCircle2} label="Selesai" value={stats?.returned ?? "—"} hint="Sudah dikembalikan" />
        </div>
      )}

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-6 shadow-card-soft">
          <h3 className="font-display text-2xl">Jelajahi Katalog</h3>
          <p className="mt-1 text-sm text-muted-foreground">Cari judul, penulis, atau kategori favoritmu.</p>
          <Link to="/books"><Button className="mt-4 bg-gradient-gold text-primary hover:opacity-90">Buka Katalog</Button></Link>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-card-soft">
          <h3 className="font-display text-2xl">{role === "teacher" ? "Tinjau Peminjaman" : "Status Peminjaman"}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{role === "teacher" ? "Setujui atau tolak permintaan dari siswa." : "Lihat riwayat dan status pinjamanmu."}</p>
          <Link to="/loans"><Button variant="outline" className="mt-4">Buka</Button></Link>
        </div>
      </div>

      {role === "teacher" && (
        <div className="mt-6 rounded-xl border bg-card p-6 shadow-card-soft">
          <h3 className="font-display text-2xl">Pindai Kartu Siswa</h3>
          <p className="mt-1 text-sm text-muted-foreground">Catat kunjungan & peminjaman lewat QR kartu siswa.</p>
          <Link to="/scan"><Button className="mt-4 bg-gradient-gold text-primary hover:opacity-90"><ScanLine className="mr-2 h-4 w-4" />Buka Scanner</Button></Link>
        </div>
      )}

      {role === "student" && user && (
        <div className="mt-6 rounded-xl border bg-card p-6 shadow-card-soft">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Kartu Siswa</span>
              <h3 className="font-display text-2xl">{profile?.full_name}</h3>
              <p className="text-sm text-muted-foreground">{profile?.class_name || "—"}</p>
              <p className="mt-2 max-w-md text-xs text-muted-foreground">Tunjukkan QR ini ke guru saat berkunjung atau meminjam buku. Kode ini menjadi identitas digitalmu di perpustakaan.</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <QRCodeCanvas value={`PUSTAKA:${user.id}`} size={160} includeMargin={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
