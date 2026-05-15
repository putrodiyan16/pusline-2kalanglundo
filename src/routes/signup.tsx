import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Library } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName, class_name: className },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Akun siswa dibuat. Silakan masuk.");
    navigate({ to: "/login" });
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="font-display text-3xl">Daftar Siswa</h1>
            <p className="text-sm text-muted-foreground">Akun guru hanya dibuat oleh administrator.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Nama lengkap</Label>
            <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="class">Kelas</Label>
            <Input id="class" placeholder="contoh: X IPA 1" value={className} onChange={(e) => setClassName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Kata sandi</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-gradient-gold text-primary hover:opacity-90">
            {loading ? "Memproses..." : "Buat akun"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">Masuk</Link>
          </p>
        </form>
      </div>
      <div className="hidden bg-gradient-hero p-12 text-primary-foreground md:flex md:flex-col md:justify-between">
        <Link to="/" className="flex items-center gap-2 self-end">
          <Library className="h-6 w-6 text-gold" />
          <span className="font-display text-xl">Pustaka Sekolah</span>
        </Link>
        <div>
          <h2 className="font-display text-4xl">Mulai pinjam buku<br/>dalam hitungan menit.</h2>
          <p className="mt-3 text-primary-foreground/70">Akun siswa otomatis aktif setelah pendaftaran.</p>
        </div>
        <span className="text-xs uppercase tracking-[0.3em] text-gold/80">Daftar · Pinjam · Baca</span>
      </div>
    </div>
  );
}