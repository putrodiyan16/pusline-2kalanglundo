import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BookOpen, GraduationCap, Library, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-hero text-primary-foreground">
        <div className="absolute inset-0 opacity-15"
          style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)", backgroundSize: "40px 40px, 60px 60px" }} />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2">
            <Library className="h-6 w-6 text-gold" />
            <span className="font-display text-xl font-semibold tracking-wide">Pustaka Sekolah</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login"><Button variant="ghost" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">Masuk</Button></Link>
            <Link to="/signup"><Button className="bg-gradient-gold text-primary hover:opacity-90">Daftar</Button></Link>
          </div>
        </nav>
        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 pb-24 pt-16 md:grid-cols-2 md:pt-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-gold">
              Perpustakaan Digital
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-tight md:text-6xl">
              Ruang baca <span className="text-gold">tanpa batas</span> untuk guru & siswa.
            </h1>
            <p className="mt-6 max-w-lg text-base text-primary-foreground/80">
              Kelola koleksi buku, peminjaman, dan riwayat baca dalam satu tempat.
              Akses cepat untuk siswa, kontrol penuh untuk guru.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup"><Button size="lg" className="bg-gradient-gold text-primary hover:opacity-90">Daftar</Button></Link>
              <Link to="/login"><Button size="lg" variant="outline" className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/10">Masuk</Button></Link>
            </div>
          </div>
          <div className="relative hidden md:block">
            <div className="absolute -inset-6 rounded-2xl bg-gradient-gold opacity-20 blur-2xl" />
            <div className="relative grid grid-cols-3 gap-3">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-md border border-white/10 bg-white/5 p-3 shadow-elegant backdrop-blur">
                  <div className="h-full rounded-sm border border-gold/30 bg-gradient-to-b from-white/10 to-transparent flex items-end p-2">
                    <BookOpen className="h-4 w-4 text-gold/70" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: BookOpen, title: "Katalog Lengkap", body: "Telusuri koleksi buku, lihat detail, dan ajukan peminjaman dengan satu klik." },
            { icon: GraduationCap, title: "Untuk Siswa", body: "Pantau buku yang sedang dipinjam dan riwayat bacaan pribadi." },
            { icon: ShieldCheck, title: "Untuk Guru", body: "Kelola buku, setujui peminjaman, dan lihat statistik perpustakaan." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 shadow-card-soft">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-xl">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t bg-card/50 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Pustaka Sekolah · By Saputro ♥
      </footer>
    </div>
  );
}
