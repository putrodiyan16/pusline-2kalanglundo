import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/loans")({
  component: LoansPage,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Menunggu", cls: "bg-amber-100 text-amber-900" },
  approved: { label: "Disetujui", cls: "bg-blue-100 text-blue-900" },
  borrowed: { label: "Dipinjam", cls: "bg-emerald-100 text-emerald-900" },
  returned: { label: "Dikembalikan", cls: "bg-secondary text-secondary-foreground" },
  rejected: { label: "Ditolak", cls: "bg-red-100 text-red-900" },
};

function LoansPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const { data: loans, isLoading, error } = useQuery({
    queryKey: ["loans", role, user?.id],
    queryFn: async () => {
      try {
        // 1️⃣ Fetch loans TANPA embed (plain query)
        let q = supabase
          .from("loans")
          .select("*")
          .order("requested_at", { ascending: false });

        if (role === "student") q = q.eq("user_id", user!.id);

        const { data: rows, error: err } = await q;
        
        if (err) {
          console.error("❌ Loans query error:", err);
          throw err;
        }

        console.log("✅ Loans fetched:", rows?.length ?? 0, "records");

        if (!rows || rows.length === 0) {
          console.log("⚠️ Tidak ada data loans");
          return [];
        }

        // 2️⃣ Fetch books (tanpa embed, plain query)
        const bookIds = [...new Set((rows as any[]).map((r) => r.book_id))];
        let bookMap = new Map<string, any>();

        if (bookIds.length > 0) {
          const { data: books, error: bookErr } = await supabase
            .from("books")
            .select("id, title, author")
            .in("id", bookIds);

          if (bookErr) {
            console.warn("⚠️ Books fetch warning:", bookErr);
          } else {
            bookMap = new Map((books ?? []).map((b) => [b.id, b]));
            console.log("✅ Books fetched:", books?.length ?? 0, "records");
          }
        }

        // 3️⃣ Fetch profiles (tanpa embed, plain query)
        const userIds = [...new Set((rows as any[]).map((r) => r.user_id))];
        let profileMap = new Map<string, any>();

        if (userIds.length > 0) {
          const { data: profs, error: profErr } = await supabase
            .from("profiles")
            .select("id, full_name, class_name")
            .in("id", userIds);

          if (profErr) {
            console.warn("⚠️ Profiles fetch warning:", profErr);
          } else {
            profileMap = new Map((profs ?? []).map((p) => [p.id, p]));
            console.log("✅ Profiles fetched:", profs?.length ?? 0, "records");
          }
        }

        // 4️⃣ Gabung data secara manual di JavaScript
        const result = (rows as any[]).map((r) => ({
          ...r,
          books: bookMap.get(r.book_id) ?? null,
          profiles: profileMap.get(r.user_id) ?? null,
        }));

        console.log("✅ Final merged data:", result.length, "records");
        return result;
      } catch (err) {
        console.error("❌ Loans query failed:", err);
        throw err;
      }
    },
    enabled: !!user && !!role,
    refetchInterval: 5000,
  });

  // 🔄 Real-time subscription
  useEffect(() => {
    if (!user || !role) return;

    console.log("🔄 Setting up real-time subscription...");

    const subscription = supabase
      .channel(`loans-${user.id}-${role}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "loans",
          filter: role === "student" ? `user_id=eq.${user.id}` : undefined,
        },
        (payload) => {
          console.log("📡 Perubahan loans:", payload);
          qc.invalidateQueries({ queryKey: ["loans", role, user.id] });
          if (role === "teacher") {
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Subscription status:", status);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [user, role, qc]);

  const update = useMutation({
    mutationFn: async ({ id, status, bookId, prev }: { id: string; status: string; bookId: string; prev: string }) => {
      const u: any = { status };
      if (status === "approved") {
        u.approved_at = new Date().toISOString();
        u.due_date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      }
      if (status === "returned") u.returned_at = new Date().toISOString();

      const { error } = await supabase.from("loans").update(u).eq("id", id);
      if (error) throw error;

      const { data: book } = await supabase.from("books").select("available_copies").eq("id", bookId).single();
      if (book) {
        let a = book.available_copies;
        const w = ["approved", "borrowed"].includes(prev),
          n = ["approved", "borrowed"].includes(status);
        if (!w && n) a -= 1;
        if (w && !n) a += 1;
        await supabase.from("books").update({ available_copies: a }).eq("id", bookId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Status diperbarui");
    },
    onError: (e: any) => {
      console.error("❌ Update error:", e);
      toast.error(e.message);
    },
  });

  const formatTanggalAjuan = (requestedAt: string | null, approvedAt: string | null) => {
    const tanggalMentah = requestedAt || approvedAt || new Date().toISOString();
    return new Date(tanggalMentah).toLocaleDateString("id-ID");
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-4xl">{role === "teacher" ? "Semua Peminjaman" : "Peminjaman Saya"}</h1>
        <p className="mt-1 text-muted-foreground">{role === "teacher" ? "Setujui, tolak, atau tandai pengembalian." : "Riwayat dan status pengajuanmu."}</p>
      </header>
      
      {isLoading && (
        <div className="rounded-xl border bg-card p-6 shadow-card-soft text-center text-muted-foreground">
          Memuat data peminjaman...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-6 shadow-card-soft text-center text-red-700">
          <p className="font-medium">❌ Gagal memuat data peminjaman</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "Terjadi kesalahan"}</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-card-soft">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground">
            <tr className="text-left">
              <th className="p-3">Buku</th>
              {role === "teacher" && <th className="p-3">Peminjam</th>}
              <th className="p-3">Diajukan/Tercatat</th>
              <th className="p-3">Jatuh Tempo</th>
              <th className="p-3">Status</th>
              <th className="p-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {(loans ?? []).map((l: any) => {
              const s = STATUS[l.status];
              return (
                <tr key={l.id} className="border-t hover:bg-secondary/20">
                  <td className="p-3">
                    <div className="font-medium">{l.books?.title || "—"}</div>
                    <div className="text-xs text-muted-foreground">{l.books?.author || "—"}</div>
                  </td>
                  {role === "teacher" && (
                    <td className="p-3">
                      <div>{l.profiles?.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.profiles?.class_name || ""}</div>
                    </td>
                  )}
                  <td className="p-3 text-muted-foreground">
                    {formatTanggalAjuan(l.requested_at, l.approved_at)}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {l.due_date ? new Date(l.due_date).toLocaleDateString("id-ID") : "—"}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s?.cls}`}>
                      {s?.label || l.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {role === "teacher" ? (
                      <div className="flex flex-wrap gap-2">
                        {l.status === "pending" && (
                          <>
                            <Button size="sm" className="bg-gradient-gold text-primary hover:opacity-90" onClick={() => update.mutate({ id: l.id, status: "approved", bookId: l.book_id, prev: l.status })}>Setuju</Button>
                            <Button size="sm" variant="outline" onClick={() => update.mutate({ id: l.id, status: "rejected", bookId: l.book_id, prev: l.status })}>Tolak</Button>
                          </>
                        )}
                        {(l.status === "approved" || l.status === "borrowed") && (
                          <Button size="sm" variant="outline" onClick={() => update.mutate({ id: l.id, status: "returned", bookId: l.book_id, prev: l.status })}>Tandai Kembali</Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!loans || loans.length === 0) && !isLoading && !error && (
              <tr>
                <td colSpan={role === "teacher" ? 6 : 5} className="p-8 text-center text-muted-foreground">
                  Belum ada peminjaman.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
