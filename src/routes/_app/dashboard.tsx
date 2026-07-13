import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BookOpen, BookMarked, Clock, CheckCircle2, Users, ScanLine, Download, Printer } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { QRCodeCanvas } from "qrcode.react";
import { useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";

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
  const cardRef = useRef<HTMLDivElement>(null);

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

  // Download card as image
  const downloadCard = async () => {
    if (!cardRef.current) return;

    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `kartu-perpustakaan-${profile?.full_name || "siswa"}.png`;
      link.click();
      toast.success("Kartu berhasil diunduh!");
    } catch (error) {
      toast.error("Gagal mengunduh kartu");
      console.error(error);
    }
  };

  // Print card
  const printCard = () => {
    if (!cardRef.current) return;

    const printWindow = window.open("", "", "height=500,width=800");
    if (!printWindow) {
      toast.error("Tidak bisa membuka window cetak");
      return;
    }

    const clonedElement = cardRef.current.cloneNode(true) as HTMLElement;
    clonedElement.style.width = "100%";
    clonedElement.style.padding = "20px";

    printWindow.document.write("<!DOCTYPE html>");
    printWindow.document.write("<html><head><title>Cetak Kartu Perpustakaan</title>");
    printWindow.document.write("<style>");
    printWindow.document.write(`
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
      * { box-sizing: border-box; }
      @media print { body { margin: 0; padding: 0; } }
    `);
    printWindow.document.write("</style></head><body>");
    printWindow.document.write(clonedElement.outerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

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
        <>
          {/* Preview Kartu Perpustakaan */}
          <div className="mt-8">
            <h2 className="font-display text-2xl mb-4">Kartu Perpustakaan</h2>
            <p className="text-sm text-muted-foreground mb-4">Unduh dan cetak kartu ini untuk menunjukkan ke guru saat berkunjung atau meminjam buku.</p>
          </div>

          {/* Card Preview (Hidden but referenced) */}
          <div className="hidden">
            <div 
              ref={cardRef}
              className="w-96 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-6 text-white shadow-2xl"
            >
              {/* Header */}
              <div className="mb-6 border-b border-blue-400 pb-4">
                <div className="text-xs uppercase tracking-widest opacity-80">Kartu Anggota Perpustakaan</div>
                <div className="text-2xl font-bold mt-2">Pustaka Sekolah</div>
              </div>

              {/* Content */}
              <div className="space-y-4">
                {/* Nama */}
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-80 mb-1">Nama Siswa</div>
                  <div className="text-xl font-semibold">{profile?.full_name || "—"}</div>
                </div>

                {/* Kelas */}
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-80 mb-1">Kelas</div>
                  <div className="text-lg font-semibold">{profile?.class_name || "—"}</div>
                </div>

                {/* QR Code */}
                <div className="flex justify-center pt-4">
                  <div className="bg-white p-3 rounded-lg">
                    <QRCodeCanvas 
                      value={`PUSTAKA:${user.id}`} 
                      size={140} 
                      includeMargin={false}
                      level="H"
                    />
                  </div>
                </div>

                {/* Footer Info */}
                <div className="pt-4 border-t border-blue-400 text-xs text-center opacity-80">
                  <div>Tunjukkan QR ini kepada guru</div>
                  <div>saat berkunjung atau meminjam buku</div>
                </div>
              </div>
            </div>
          </div>

          {/* Visible Card Display - Smaller Version for Preview */}
          <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white shadow-2xl mb-6 max-w-2xl">
            {/* Header */}
            <div className="mb-6 border-b border-blue-400 pb-4">
              <div className="text-xs uppercase tracking-widest opacity-80">Kartu Anggota Perpustakaan</div>
              <div className="text-3xl font-bold mt-2">Pustaka Sekolah</div>
            </div>

            {/* Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Left: Info */}
              <div className="space-y-6">
                {/* Nama */}
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-80 mb-2">Nama Siswa</div>
                  <div className="text-3xl font-bold">{profile?.full_name || "—"}</div>
                </div>

                {/* Kelas */}
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-80 mb-2">Kelas</div>
                  <div className="text-2xl font-semibold">{profile?.class_name || "—"}</div>
                </div>

                {/* Footer Info */}
                <div className="pt-4 border-t border-blue-400 text-sm opacity-90">
                  <div>Tunjukkan QR ini kepada guru</div>
                  <div>saat berkunjung atau meminjam buku</div>
                </div>
              </div>

              {/* Right: QR Code */}
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-xl">
                  <QRCodeCanvas 
                    value={`PUSTAKA:${user.id}`} 
                    size={180} 
                    includeMargin={false}
                    level="H"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-8">
            <Button 
              onClick={downloadCard}
              className="gap-2 bg-gradient-gold text-primary hover:opacity-90"
            >
              <Download className="h-4 w-4" />
              Unduh Kartu
            </Button>
            <Button 
              onClick={printCard}
              variant="outline"
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Cetak Kartu
            </Button>
          </div>

          {/* Info Box */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-4 text-sm">
            <div className="font-semibold text-blue-900 dark:text-blue-100 mb-2">💡 Tips Penggunaan Kartu:</div>
            <ul className="space-y-1 text-blue-800 dark:text-blue-200 text-xs">
              <li>✓ Cetak kartu dalam ukuran ID (8.5 x 5.4 cm) untuk hasil optimal</li>
              <li>✓ Laminating kartu agar lebih tahan lama</li>
              <li>✓ Tunjukkan QR ke guru saat berkunjung atau meminjam buku</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
