import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/manage/books")({
  component: ManageBooksPage,
});

function ManageBooksPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  useEffect(() => { if (!loading && role && role !== "teacher") navigate({ to: "/dashboard" }); }, [loading, role, navigate]);

  const { data: books } = useQuery({
    queryKey: ["books"],
    queryFn: async () => (await supabase.from("books").select("*").order("title")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (form: any) => {
      if (editing) {
        const { error } = await supabase.from("books").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("books").insert({ ...form, available_copies: form.total_copies });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["books"] }); setOpen(false); setEditing(null); toast.success("Buku tersimpan"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("books").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["books"] }); toast.success("Buku dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    save.mutate({
      title: fd.get("title") as string,
      author: fd.get("author") as string,
      category: fd.get("category") as string,
      description: fd.get("description") as string,
      total_copies: Number(fd.get("total_copies") || 1),
    });
  };

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl">Kelola Buku</h1>
          <p className="mt-1 text-muted-foreground">Tambah, ubah, atau hapus koleksi.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-gold text-primary hover:opacity-90"><Plus className="mr-2 h-4 w-4" />Tambah Buku</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">{editing ? "Edit Buku" : "Buku Baru"}</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3">
              <div><Label>Judul</Label><Input name="title" required defaultValue={editing?.title} /></div>
              <div><Label>Penulis</Label><Input name="author" required defaultValue={editing?.author} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Kategori</Label><Input name="category" defaultValue={editing?.category ?? ""} /></div>
                <div><Label>Jumlah Salinan</Label><Input type="number" min={1} name="total_copies" required defaultValue={editing?.total_copies ?? 1} /></div>
              </div>
              <div><Label>Deskripsi</Label><Textarea name="description" defaultValue={editing?.description ?? ""} /></div>
              <DialogFooter><Button type="submit" disabled={save.isPending} className="bg-gradient-gold text-primary hover:opacity-90">Simpan</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card-soft">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground"><tr className="text-left">
            <th className="p-3">Judul</th><th className="p-3">Penulis</th><th className="p-3">Kategori</th><th className="p-3">Salinan</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {(books ?? []).map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-3 font-medium">{b.title}</td>
                <td className="p-3 text-muted-foreground">{b.author}</td>
                <td className="p-3 text-muted-foreground">{b.category}</td>
                <td className="p-3">{b.available_copies}/{b.total_copies}</td>
                <td className="p-3"><div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(b); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={() => { if (confirm(`Hapus "${b.title}"?`)) del.mutate(b.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}