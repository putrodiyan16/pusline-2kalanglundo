import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

  const { data: loans } = useQuery({
    queryKey: ["loans", role, user?.id],
    queryFn: async () => {
      // 1) Ambil loans + judul buku (FK loans.book_id -> books.id valid)
      let q = supabase
        .from("loans")
        .select("*, books(title, author)")
        .order("approved_at", { ascending: false, nullsFirst: false });

      if (role === "student") q = q.eq("user_id", user!.id);

      const { data: rows, error } = await q;
      if (error) throw error;

      // 2) Ambil profil peminjam terpisah.
      // FK loans.user_id menunjuk ke auth.users (BUKAN profiles),
      // sehingga PostgREST tidak bisa meng-embed profiles secara langsung.
      const userIds = [...new Set((rows ?? []).map((r: any) => r.user_id))];
      let profileMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, class_name")
          .in("id", userIds as any);
        profileMap = new Map((profs ?? []).map((p) => [p.id, p]));
      }

      return (rows ?? []).map((r: any) => ({
        ...r,
        profiles: profileMap.get(r.user_id) ?? null,
      })) as any[];
    },
    enabled: !!user && !!role,
  });

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
    onError: (e: any) => toast.error(e.message),
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
            {(loans ?? []).map((l) => {
              const s = STATUS[l.status];
              return (
                <tr key={l.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{l.books?.title}</div>
                    <div className="text-xs text-muted-foreground">{l.books?.author}</div>
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
                            <Button size="sm" className="bg-gradient-gold text-primary hover:opacity-90" onClick={() => update.mutate({ id: l.id, status: "approved", bookId: l.book_id, prev: l.status })}>Setujui</Button>
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
            {(!loans || loans.length === 0) && (
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
