import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ScanLine, UserCheck, BookMarked, History, ArrowLeft, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_app/scan")({
  component: ScanPage,
});

type Mode = "visit" | "borrow";
type Student = { id: string; full_name: string; class_name: string | null };

function parseQr(text: string): string | null {
  const m = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1].toLowerCase() : null;
}

function ScanPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("visit");
  const [scanning, setScanning] = useState(false);
  const [lastUser, setLastUser] = useState<Student | null>(null);
  const [scannedStudent, setScannedStudent] = useState<Student | null>(null);
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [bookSearch, setBookSearch] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";
  
  const isProcessingRef = useRef<boolean>(false);
  const cooldownRef = useRef<number>(0);
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && role && role !== "teacher") navigate({ to: "/dashboard" });
  }, [loading, role, navigate]);

  const { data: recent } = useQuery({
    queryKey: ["recent-visits"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("visits")
        .select("id, visited_at, purpose, user_id")
        .order("visited_at", { ascending: false })
        .limit(15);
      const ids = [...new Set((data ?? []).map((v: any) => v.user_id))];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, class_name").in("id", ids as any);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((v: any) => ({ ...v, profile: map.get(v.user_id) }));
    },
    refetchInterval: 5000,
  });

  const { data: books } = useQuery({
    queryKey: ["books-for-loan"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select("id, title, author, available_copies")
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stop = async () => {
    try {
      await scannerRef.current?.stop();
      await scannerRef.current?.clear();
    } catch {}
    scannerRef.current = null;
    setScanning(false);
  };

  const handleDecoded = async (text: string) => {
    const now = Date.now();
    if (isProcessingRef.current || now - cooldownRef.current < 3000) return;
    
    isProcessingRef.current = true;

    // Hentikan pemindaian gambar secara instan di level hardware/kamera
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.pause(true);
      } catch (e) {
        console.error("Gagal menjeda kamera:", e);
      }
    }

    try {
      const userId = parseQr(text);
      if (!userId) {
        toast.error("QR tidak valid");
        if (scannerRef.current) await scannerRef.current.resume();
        isProcessingRef.current = false;
        return;
      }
      
      const { data: prof, error } = await supabase
        .from("profiles")
        .select("id, full_name, class_name")
        .eq("id", userId)
        .maybeSingle();
        
      if (error || !prof) {
        toast.error("Siswa tidak ditemukan");
        if (scannerRef.current) await scannerRef.current.resume();
        isProcessingRef.current = false;
        return;
      }

      if (mode === "visit") {
        const { error: insErr } = await (supabase as any)
          .from("visits")
          .insert({ user_id: userId, purpose: "visit" });
          
        if (insErr) {
          toast.error(insErr.message);
          if (scannerRef.current) await scannerRef.current.resume();
          isProcessingRef.current = false;
          return;
        }
        
        setLastUser(prof);
        toast.success(`Kunjungan tercatat: ${prof.full_name}`);
        qc.invalidateQueries({ queryKey: ["recent-visits"] });

        // 🎯 AUTO-CLOSE KAMERA SETELAH SCAN KUNJUNGAN
        await stop();
        cooldownRef.current = Date.now();
        isProcessingRef.current = false;

      } else {
        setScannedStudent(prof);
        setSelectedBooks(new Set());
        // 🎯 AUTO-CLOSE KAMERA SETELAH SCAN PEMINJAMAN
        await stop();
        toast.success(`Siswa terdeteksi: ${prof.full_name}`);
        isProcessingRef.current = false;
      }
    } catch (e: any) {
      toast.error("Terjadi kesalahan sistem");
      if (scannerRef.current) {
        try { await scannerRef.current.resume(); } catch {}
      }
      isProcessingRef.current = false;
    }
  };

  const start = async () => {
    try {
      const el = document.getElementById(containerId);
      if (!el) return;
      
      isProcessingRef.current = false;
      
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => { void handleDecoded(decoded); },
        () => {},
      );
      setScanning(true);
    } catch (e: any) {
      toast.error("Tidak dapat mengakses kamera: " + (e?.message ?? e));
    }
  };

  useEffect(() => {
    return () => { void stop(); };
  }, []);

  const toggleBook = (id: string) => {
    setSelectedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const approveLoans = async () => {
    if (!scannedStudent || selectedBooks.size === 0) {
      toast.error("Pilih minimal satu buku");
      return;
    }

    const nowIso = new Date().toISOString();
    const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    
    // Perbaikan di bagian ini: status diubah menjadi "approved" agar sesuai dengan enum di Supabase
    const rows = Array.from(selectedBooks).map((book_id) => ({
      user_id: scannedStudent.id,
      book_id,
      status: "approved", 
      approved_at: nowIso,
      due_date: due,
    }));

    const { error: loanError } = await supabase.from("loans").insert(rows);
    if (loanError) {
      toast.error(`Gagal menyimpan pinjaman: ${loanError.message}`);
      return;
    }

    const { error: visitError } = await (supabase as any)
      .from("visits")
      .insert({ user_id: scannedStudent.id, purpose: "borrow" });
      
    if (visitError) {
      toast.error(`Gagal mencatat riwayat kunjungan: ${visitError.message}`);
      return;
    }

    const updatePromises = Array.from(selectedBooks).map(async (id) => {
      const b = (books ?? []).find((x: any) => x.id === id);
      if (b && typeof b.available_copies === "number") {
        return supabase
          .from("books")
          .update({ available_copies: Math.max(0, b.available_copies - 1) })
          .eq("id", id);
      }
    });

    await Promise.all(updatePromises);

    toast.success(`${rows.length} peminjaman tercatat untuk ${scannedStudent.full_name}`);
    
    qc.invalidateQueries({ queryKey: ["loans"] });
    qc.invalidateQueries({ queryKey: ["books"] });
    qc.invalidateQueries({ queryKey: ["books-for-loan"] });
    qc.invalidateQueries({ queryKey: ["recent-visits"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    
    setScannedStudent(null);
    setSelectedBooks(new Set());
  };
  
  const filteredBooks = (books ?? []).filter((b: any) => {
    if (!bookSearch) return true;
    const q = bookSearch.toLowerCase();
    return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
  });

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Guru</span>
          <h1 className="font-display text-4xl">Pindai QR Siswa</h1>
          <p className="mt-1 text-muted-foreground">Catat kunjungan perpustakaan atau peminjaman buku.</p>
        </div>
      </header>

      {scannedStudent && mode === "borrow" ? (
        <div className="rounded-xl border bg-card p-6 shadow-card-soft">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Identitas Siswa</div>
              <div className="font-display text-2xl">{scannedStudent.full_name}</div>
              <div className="text-sm text-muted-foreground">{scannedStudent.class_name || "—"}</div>
            </div>
            <Button variant="ghost" onClick={() => { setScannedStudent(null); setSelectedBooks(new Set()); }}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Batal
            </Button>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-display text-lg">Pilih Buku yang Dipinjam</h3>
            <input
              type="search"
              value={bookSearch}
              onChange={(e) => setBookSearch(e.target.value)}
              placeholder="Cari judul / penulis..."
              className="h-9 w-64 max-w-full rounded-md border bg-background px-3 text-sm"
            />
          </div>

          <ul className="max-h-[420px] divide-y overflow-y-auto rounded-lg border">
            {filteredBooks.map((b: any) => {
              const disabled = b.available_copies <= 0;
              const checked = selectedBooks.has(b.id);
              return (
                <li
                  key={b.id}
                  className={`flex items-center gap-3 p-3 ${disabled ? "opacity-50" : "hover:bg-secondary/40 cursor-pointer"}`}
                  onClick={() => !disabled && toggleBook(b.id)}
                >
                  <input type="checkbox" checked={checked} disabled={disabled} readOnly className="h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">{b.title}</div>
                    <div className="text-xs text-muted-foreground">{b.author}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">Tersedia: {b.available_copies}</span>
                </li>
              );
            })}
            {filteredBooks.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Tidak ada buku.</li>}
          </ul>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">{selectedBooks.size} buku dipilih</div>
            <Button onClick={approveLoans} disabled={selectedBooks.size === 0} className="bg-gradient-gold text-primary hover:opacity-90">
              <Check className="mr-2 h-4 w-4" /> Setuju & Catat Peminjaman
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-xl border bg-card p-5 shadow-card-soft">
            <div className="mb-4 flex gap-2">
              <Button variant={mode === "visit" ? "default" : "outline"} onClick={() => setMode("visit")}>
                <UserCheck className="mr-2 h-4 w-4" /> Kunjungan
              </Button>
              <Button variant={mode === "borrow" ? "default" : "outline"} onClick={() => setMode("borrow")}>
                <BookMarked className="mr-2 h-4 w-4" /> Peminjaman
              </Button>
            </div>

            <div id={containerId} className="aspect-square w-full overflow-hidden rounded-lg bg-black/90" />

            <div className="mt-4 flex gap-2">
              {!scanning ? (
                <Button onClick={start} className="bg-gradient-gold text-primary hover:opacity-90">
                  <ScanLine className="mr-2 h-4 w-4" /> Mulai Pindai
                </Button>
              ) : (
                <Button onClick={stop} variant="outline">Berhenti</Button>
              )}
            </div>

            {lastUser && (
              <div className="mt-4 rounded-lg border bg-secondary/40 p-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Terakhir dipindai</div>
                <div className="font-display text-xl">{lastUser.full_name}</div>
                <div className="text-sm text-muted-foreground">{lastUser.class_name || "—"}</div>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-card-soft">
            <div className="mb-3 flex items-center gap-2"><History className="h-4 w-4" /><h3 className="font-display text-xl">Aktivitas Terbaru</h3></div>
            <ul className="divide-y">
              {(recent ?? []).map((v: any) => (
                <li key={v.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{v.profile?.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{v.profile?.class_name || ""}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${v.purpose === "borrow" ? "bg-gradient-gold text-primary" : "bg-secondary text-secondary-foreground"}`}>
                      {v.purpose === "borrow" ? "Pinjam" : "Kunjung"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{new Date(v.visited_at).toLocaleString("id-ID")}</div>
                </li>
              ))}
              {(!recent || recent.length === 0) && <li className="py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
