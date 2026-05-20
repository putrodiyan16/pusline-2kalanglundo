import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ScanLine, UserCheck, BookMarked, History } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_app/scan")({
  component: ScanPage,
});

type Mode = "visit" | "borrow";

function parseQr(text: string): string | null {
  // Format kartu: "PUSTAKA:<user_id>" atau langsung UUID
  const m = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1].toLowerCase() : null;
}

function ScanPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("visit");
  const [scanning, setScanning] = useState(false);
  const [lastUser, setLastUser] = useState<{ id: string; full_name: string; class_name: string | null } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";
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

  const handleDecoded = async (text: string) => {
    const now = Date.now();
    if (now - cooldownRef.current < 2500) return;
    cooldownRef.current = now;

    const userId = parseQr(text);
    if (!userId) {
      toast.error("QR tidak valid");
      return;
    }
    const { data: prof, error } = await supabase
      .from("profiles")
      .select("id, full_name, class_name")
      .eq("id", userId)
      .maybeSingle();
    if (error || !prof) {
      toast.error("Siswa tidak ditemukan");
      return;
    }
    const { error: insErr } = await (supabase as any)
      .from("visits")
      .insert({ user_id: userId, purpose: mode });
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    setLastUser(prof);
    toast.success(`${mode === "visit" ? "Kunjungan" : "Peminjaman"} tercatat: ${prof.full_name}`);
    qc.invalidateQueries({ queryKey: ["recent-visits"] });
  };

  const start = async () => {
    try {
      const el = document.getElementById(containerId);
      if (!el) return;

      // Bersihkan instance lama jika ada sebelum membuat yang baru
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {}
      }

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      
      await scanner.start(
        { facingMode: "environment" },
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 } // PERBAIKAN: Menggunakan height, bukan width_
        },
        (decoded) => handleDecoded(decoded),
        () => {},
      );
      setScanning(true);
    } catch (e: any) {
      toast.error("Tidak dapat mengakses kamera: " + (e?.message ?? e));
    }
  };

  const stop = async () => {
    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
    } catch (e) {
      console.error("Gagal menghentikan scanner:", e);
    } finally {
      scannerRef.current = null;
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup saat komponen unmount
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
        <p className="mt-1 text-muted-foreground">Catat kunjungan perpustakaan atau peminjaman buku.</p>
      </header>

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
    </div>
  );
}
