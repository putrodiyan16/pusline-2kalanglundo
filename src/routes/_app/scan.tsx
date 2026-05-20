import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ScanLine, UserCheck, BookMarked, History, LayoutDashboard, BookOpen, CheckCircle } from "lucide-react"; 
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_app/scan")({
  component: ScanPage,
});

type Mode = "visit" | "borrow";

function parseQr(text: string): string | null {
  const m = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1].toLowerCase() : null;
}

function ScanPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("visit");
  
  // State untuk menyimpan ID buku yang dipilih dari katalog
  const [selectedBookId, setSelectedBookId] = useState(""); 
  const [issubmitting, setIsSubmitting] = useState(false);
  
  const [scanning, setScanning] = useState(false);
  const [lastUser, setLastUser] = useState<{ id: string; full_name: string; class_name: string | null } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";
  
  const isProcessingRef = useRef<boolean>(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && role && role !== "teacher") navigate({ to: "/dashboard" });
  }, [loading, role, navigate]);

  // 1. Ambil data katalog dari tabel 'books' sesuai skema Anda
  const { data: booksCatalog } = useQuery({
    queryKey: ["books-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select("id, title, available_copies")
        .order("title", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // 2. Ambil data aktivitas riwayat gabungan (Kunjungan & Peminjaman terbaru)
  const { data: recentAktivitas } = useQuery({
    queryKey: ["recent-activities"],
    queryFn: async () => {
      // Ambil 10 data peminjaman buku terbaru dari tabel loans
      const { data: loansData } = await supabase
        .from("loans")
        .select("id, requested_at, user_id, books(title)")
        .order("requested_at", { ascending: false })
        .limit(10);

      // Ambil 10 data kunjungan terbaru dari tabel visits
      const { data: visitsData } = await (supabase as any)
        .from("visits")
        .select("id, visited_at, user_id")
        .order("visited_at", { ascending: false })
        .limit(10);

      // Kumpulkan semua id user untuk mengambil profilnya sekaligus
      const userIds = [
        ...new Set([
          ...(loansData ?? []).map((l: any) => l.user_id),
          ...(visitsData ?? []).map((v: any) => v.user_id),
        ]),
      ];

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, class_name")
        .in("id", userIds as any);

      const profileMap = new Map((profs ?? []).map((p) => [p.id, p]));

      // Format dan gabungkan datanya menjadi satu list riwayat
      const formattedLoans = (loansData ?? []).map((l: any) => ({
        id: l.id,
        time: l.requested_at,
        type: "borrow",
        book_title: l.books?.title || "Buku tidak diketahui",
        profile: profileMap.get(l.user_id),
      }));

      const formattedVisits = (visitsData ?? []).map((v: any) => ({
        id: v.id,
        time: v.visited_at,
        type: "visit",
        book_title: null,
        profile: profileMap.get(v.user_id),
      }));

      return [...formattedLoans, ...formattedVisits]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 15);
    },
    refetchInterval: 5000,
  });

  // Fungsi saat QR siswa berhasil terbaca kamera
  const handleDecoded = async (text: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const userId = parseQr(text);
    if (!userId) {
      toast.error("QR tidak valid");
      setTimeout(() => { isProcessingRef.current = false; }, 1500);
      return;
    }

    // Segera matikan kamera
    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
        setScanning(false);
      }
    } catch (err) {
      console.error(err);
    }

    // Ambil data profil siswa
    const { data: prof, error } = await supabase
      .from("profiles")
      .select("id, full_name, class_name")
      .eq("id", userId)
      .maybeSingle();

    if (error || !prof) {
      toast.error("Siswa tidak ditemukan");
      isProcessingRef.current = false;
      return;
    }

    setLastUser(prof);

    // KONDISI 1: Jika memilih mode 'Kunjungan', langsung otomatis simpan ke tabel visits
    if (mode === "visit") {
      const { error: insErr } = await (supabase as any)
        .from("visits")
        .insert({ user_id: userId, purpose: "visit" });
      
      if (!insErr) {
        toast.success(`Kunjungan siswa ${prof.full_name} berhasil dicatat!`);
        qc.invalidateQueries({ queryKey: ["recent-activities"] });
      } else {
        toast.error(insErr.message);
      }
    } else {
      // Jika mode peminjaman, cukup tampilkan identitas siswa dulu agar guru bisa pilih buku
      toast.success(`Siswa terdeteksi: ${prof.full_name}. Silakan pilih buku.`);
    }

    isProcessingRef.current = false;
  };

  // KONDISI 2: Fungsi Simpan data khusus Peminjaman ke tabel 'public.loans'
  const handleSaveBorrow = async () => {
    if (!lastUser) return;
    if (!selectedBookId) {
      toast.error("Silakan pilih buku dari katalog terlebih dahulu!");
      return;
    }

    setIsSubmitting(true);

    // Mengirimkan data peminjaman langsung ke tabel public.loans Anda
    const { error: insErr } = await supabase
      .from("loans")
      .insert({ 
        user_id: lastUser.id, 
        book_id: selectedBookId,
        status: "approved", // Langsung diset 'approved' karena di-input langsung oleh guru di tempat
        notes: "Dipinjam lewat scan perpustakaan",
        approved_at: new Date().toISOString()
      });

    if (insErr) {
      toast.error(insErr.message);
      setIsSubmitting(false);
      return;
    }

    toast.success(`Peminjaman buku berhasil dicatat di tabel loans untuk ${lastUser.full_name}!`);
    qc.invalidateQueries({ queryKey: ["recent-activities"] });
    
    // Reset Form Peminjaman
    setLastUser(null);
    setSelectedBookId("");
    setIsSubmitting(false);
  };

  const start = async () => {
    try {
      setLastUser(null);
      setSelectedBookId("");

      const el = document.getElementById(containerId);
      if (!el) return;

      if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch {}
      }

      isProcessingRef.current = false;
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => handleDecoded(decoded),
        () => {},
      );
      setScanning(true);
    } catch (e: any) {
      toast.error("Tidak dapat mengakses kamera: " + (e?.message ?? e));
      isProcessingRef.current = false;
    }
  };

  const stop = async () => {
    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
    } catch (e) {
      console.error(e);
    } finally {
      scannerRef.current = null;
      setScanning(false);
      isProcessingRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div>
      <header className="mb-6">
        <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Guru</span>
        <h1 className="font-display text-4xl">Pindai QR Siswa</h1>
        <p className="mt-1 text-muted-foreground">Catat kunjungan perpustakaan atau peminjaman buku resmi.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border bg-card p-5 shadow-card-soft">
          <div className="mb-4 flex gap-2">
            <Button variant={mode === "visit" ? "default" : "outline"} onClick={() => { setMode("visit"); setLastUser(null); }}>
              <UserCheck className="mr-2 h-4 w-4" /> Kunjungan
            </Button>
            <Button variant={mode === "borrow" ? "default" : "outline"} onClick={() => { setMode("borrow"); setLastUser(null); }}>
              <BookMarked className="mr-2 h-4 w-4" /> Peminjaman Buku
            </Button>
          </div>

          {/* Sembunyikan kamera jika sedang memproses buku siswa terpilih */}
          {!(mode === "borrow" && lastUser) && (
            <div id={containerId} className="aspect-square w-full overflow-hidden rounded-lg bg-black/90" />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {!(mode === "borrow" && lastUser) && (
              <>
                {!scanning ? (
                  <Button onClick={start} className="bg-gradient-gold text-primary hover:opacity-90">
                    <ScanLine className="mr-2 h-4 w-4" /> Mulai Pindai Siswa
                  </Button>
                ) : (
                  <Button onClick={stop} variant="outline">Berhenti</Button>
                )}
              </>
            )}

            <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
              <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
            </Button>
          </div>

          {/* TAMPILAN IDENTITAS SISWA & DROPDOWN SELEKSI BUKU */}
          {lastUser && (
            <div className="mt-6 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/20 p-5 dark:border-amber-800">
              <div className="mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Siswa Peminjam Terdeteksi</span>
                <div className="font-display text-2xl mt-1 font-bold">{lastUser.full_name}</div>
                <div className="text-sm text-muted-foreground">Kelas: {lastUser.class_name || "—"}</div>
              </div>
              
              {mode === "borrow" && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <label className="text-sm font-medium flex items-center gap-1.5 text-foreground">
                    <BookOpen className="h-4 w-4 text-amber-600" /> Pilih Buku Dari Katalog Resmi (`public.books`):
                  </label>
                  
                  <select
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- Pilih Judul Buku --</option>
                    {booksCatalog?.map((book: any) => (
                      <option key={book.id} value={book.id}>
                        {book.title} {book.available_copies !== undefined ? `(Sisa: ${book.available_copies})` : ""}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSaveBorrow} disabled={issubmitting} className="bg-emerald-600 text-white hover:bg-emerald-700">
                      <CheckCircle className="mr-2 h-4 w-4" /> Masukkan ke Data Loans
                    </Button>
                    <Button variant="ghost" onClick={() => { setLastUser(null); setSelectedBookId(""); }}>
                      Batal
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AREA SISI KANAN: AKTIVITAS TERBARU GABUNGAN (LOANS & VISITS) */}
        <div className="rounded-xl border bg-card p-5 shadow-card-soft">
          <div className="mb-3 flex items-center gap-2"><History className="h-4 w-4" /><h3 className="font-display text-xl">Aktivitas Terbaru</h3></div>
          <ul className="divide-y">
            {(recentAktivitas ?? []).map((act: any) => (
              <li key={act.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{act.profile?.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{act.profile?.class_name || ""}</div>
                    {act.book_title && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 italic flex items-center gap-1">
                        <BookOpen className="h-3 w-3" /> Pinjam: {act.book_title}
                      </div>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${act.type === "borrow" ? "bg-amber-600 text-white" : "bg-secondary text-secondary-foreground"}`}>
                    {act.type === "borrow" ? "Buku (Loans)" : "Kunjung"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{new Date(act.time).toLocaleString("id-ID")}</div>
              </li>
            ))}
            {(!recentAktivitas || recentAktivitas.length === 0) && <li className="py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
