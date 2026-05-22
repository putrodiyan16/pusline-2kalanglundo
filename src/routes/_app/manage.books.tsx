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
import { Pencil, Plus, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/_app/manage/books")({
  component: ManageBooksPage,
});

function ManageBooksPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

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
      cover_url: (fd.get("cover_url") as string)?.trim() || null,
    });
  };

  // 🔄 CSV Import Handler
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvLoading(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim());

      if (lines.length < 2) {
        toast.error("File CSV kosong atau tidak valid");
        return;
      }

      // Parse header
      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().toLowerCase());
      const titleIdx = headers.indexOf("title");
      const authorIdx = headers.indexOf("author");
      const categoryIdx = headers.indexOf("category");
      const descIdx = headers.indexOf("description");
      const totalIdx = headers.indexOf("total_copies");
      const coverIdx = headers.indexOf("cover_url");

      if (titleIdx === -1 || authorIdx === -1 || totalIdx === -1) {
        toast.error("CSV harus punya kolom: title, author, total_copies");
        return;
      }

      // Parse data rows
      const books = lines.slice(1).map((line) => {
        const parts = line.split(",").map((p) => p.trim());
        const totalCopies = Math.max(1, parseInt(parts[totalIdx]) || 1);

        return {
          title: parts[titleIdx] || "Untitled",
          author: parts[authorIdx] || "Unknown",
          category: parts[categoryIdx] || "Umum",
          description: descIdx !== -1 ? parts[descIdx] || "" : "",
          total_copies: totalCopies,
          available_copies: totalCopies,
          cover_url: coverIdx !== -1 && parts[coverIdx] ? parts[coverIdx] : null,
        };
      });

      // Insert ke Supabase
      const { error } = await supabase.from("books").insert(books);

      if (error) {
        toast.error("Gagal import: " + error.message);
      } else {
        toast.success(`✅ ${books.length} buku berhasil diimport!`);
        qc.invalidateQueries({ queryKey: ["books"] });
        setCsvOpen(false);
        // Reset file input
        e.target.value = "";
      }
    } catch (err) {
      console.error("CSV parse error:", err);
      toast.error("Error: " + (err instanceof Error ? err.message : "Gagal parse CSV"));
    } finally {
      setCsvLoading(false);
    }
  };

  return (
    <div>
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-4xl">Kelola Buku</h1>
          <p className="mt-1 text-muted-foreground">Tambah, ubah, atau hapus koleksi.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* CSV Import Button */}
          <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Import Buku dari CSV</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border border-dashed bg-secondary/20 p-6 text-center">
                  <Label htmlFor="csv-file" className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Pilih file CSV</p>
                        <p className="text-xs text-muted-foreground">atau drag and drop di sini</p>
                      </div>
                    </div>
                    <Input
                      id="csv-file"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCSVUpload}
                      disabled={csvLoading}
                    />
                  </Label>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Format CSV yang diperlukan:</p>
                  <code className="block rounded bg-secondary p-2 text-xs">
                    title,author,category,description,total_copies,cover_url
                  </code>
                  <p className="text-xs text-muted-foreground">
                    Kolom yang wajib: <strong>title, author, total_copies</strong>
                    <br />
                    Kolom optional: category, description, cover_url
                  </p>
                </div>
                <div className="space-y-1 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
                  <p className="font-medium">Contoh CSV:</p>
                  <code className="block whitespace-pre-wrap">
{`Bumi Manusia,Pramoedya Ananta Toer,Sastra,Tetralogi Pulau Buru,3,
Laskar Pelangi,Andrea Hirata,Novel,Kisah anak-anak Belitung,2,
Sapiens,Yuval Noah Harari,Sejarah,Riwayat umat manusia,2,`}
                  </code>
                </div>
                {csvLoading && (
                  <p className="text-center text-sm text-muted-foreground">
                    Sedang memproses file...
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Book Button */}
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-primary hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" />Tambah Buku
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">
                  {editing ? "Edit Buku" : "Buku Baru"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <Label>Judul</Label>
                  <Input name="title" required defaultValue={editing?.title} />
                </div>
                <div>
                  <Label>Penulis</Label>
                  <Input name="author" required defaultValue={editing?.author} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Kategori</Label>
                    <Input name="category" defaultValue={editing?.category ?? ""} />
                  </div>
                  <div>
                    <Label>Jumlah Salinan</Label>
                    <Input
                      type="number"
                      min={1}
                      name="total_copies"
                      required
                      defaultValue={editing?.total_copies ?? 1}
                    />
                  </div>
                </div>
                <div>
                  <Label>Deskripsi</Label>
                  <Textarea name="description" defaultValue={editing?.description ?? ""} />
                </div>
                <div>
                  <Label>URL Sampul (Cover)</Label>
                  <Input
                    name="cover_url"
                    type="url"
                    placeholder="https://contoh.com/sampul.jpg"
                    defaultValue={editing?.cover_url ?? ""}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tempel link gambar (jpg/png). Kosongkan jika tidak ada.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={save.isPending}
                    className="bg-gradient-gold text-primary hover:opacity-90"
                  >
                    Simpan
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-card-soft">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground">
            <tr className="text-left">
              <th className="p-3">Judul</th>
              <th className="p-3">Penulis</th>
              <th className="p-3">Kategori</th>
              <th className="p-3">Salinan</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(books ?? []).map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-3 font-medium">{b.title}</td>
                <td className="p-3 text-muted-foreground">{b.author}</td>
                <td className="p-3 text-muted-foreground">{b.category}</td>
                <td className="p-3">
                  {b.available_copies}/{b.total_copies}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(b);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm(`Hapus "${b.title}"?`)) del.mutate(b.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
