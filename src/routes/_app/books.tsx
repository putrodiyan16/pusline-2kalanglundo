import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/books")({
  component: BooksPage,
});

function BooksPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: books } = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const { data, error } = await supabase.from("books").select("*").order("title");
      if (error) throw error;
      return data;
    },
  });

  const requestLoan = useMutation({
    mutationFn: async (bookId: string) => {
      const { error } = await supabase.from("loans").insert({ book_id: bookId, user_id: user!.id, status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pengajuan peminjaman dikirim. Menunggu persetujuan guru."); qc.invalidateQueries({ queryKey: ["loans"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = (books ?? []).filter((b) =>
    [b.title, b.author, b.category].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Katalog Buku</h1>
          <p className="mt-1 text-muted-foreground">{books?.length ?? 0} judul tersedia di perpustakaan.</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari judul, penulis, kategori..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((b) => (
          <article key={b.id} className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-card-soft transition hover:shadow-elegant">
            <div className="relative aspect-[3/4] bg-gradient-hero">
              <div className="absolute inset-4 flex flex-col justify-between rounded border border-gold/30 p-3 text-primary-foreground">
                <BookOpen className="h-5 w-5 text-gold" />
                <div>
                  <div className="font-display text-lg leading-tight line-clamp-3">{b.title}</div>
                  <div className="mt-1 text-xs text-primary-foreground/70">{b.author}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{b.category || "Umum"}</span>
                <span className={b.available_copies > 0 ? "text-emerald-700" : "text-destructive"}>
                  {b.available_copies}/{b.total_copies} tersedia
                </span>
              </div>
              {b.description && <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{b.description}</p>}
              {role === "student" && (
                <Button
                  className="mt-4 bg-gradient-gold text-primary hover:opacity-90"
                  disabled={b.available_copies <= 0 || requestLoan.isPending}
                  onClick={() => requestLoan.mutate(b.id)}
                >
                  {b.available_copies <= 0 ? "Tidak tersedia" : "Ajukan Pinjam"}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <p className="mt-10 text-center text-muted-foreground">Tidak ada buku yang cocok.</p>}
    </div>
  );
}