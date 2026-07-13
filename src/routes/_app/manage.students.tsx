import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Plus } from "lucide-react";
import { useForm } from "react-hook-form";

export const Route = createFileRoute("/_app/manage/students")({
  component: ManageStudentsPage,
});

interface StudentForm {
  fullName: string;
  email: string;
  className: string;
}

function ManageStudentsPage() {
  const { role, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openBulkDialog, setOpenBulkDialog] = useState(false);

  useEffect(() => { if (!loading && role && role !== "teacher") navigate({ to: "/dashboard" }); }, [loading, role, navigate]);

  const { data: rows } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const map = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => { const a = map.get(r.user_id) ?? []; a.push(r.role); map.set(r.user_id, a); });
      return (profiles ?? []).map((p: any) => ({ ...p, roles: map.get(p.id) ?? [] }));
    },
  });

  const promote = useMutation({
    mutationFn: async ({ userId, makeTeacher }: { userId: string; makeTeacher: boolean }) => {
      if (makeTeacher) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "teacher" });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "teacher");
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-users"] }); toast.success("Peran diperbarui"); },
    onError: (e: any) => toast.error(e.message),
  });

  // Mutation untuk menambah siswa
  const addStudent = useMutation({
    mutationFn: async (data: StudentForm) => {
      // 1. Buat user account di auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: data.email,
        password: Math.random().toString(36).slice(-12), // Password acak
        email_confirm: true,
      });

      if (authError) throw new Error(`Auth error: ${authError.message}`);

      // 2. Buat profile
      const { error: profileError } = await supabase.from("profiles").insert({
        id: authData.user?.id,
        full_name: data.fullName,
        class_name: data.className,
      });

      if (profileError) throw new Error(`Profile error: ${profileError.message}`);

      // 3. Set role sebagai student
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: authData.user?.id,
        role: "student",
      });

      if (roleError) throw new Error(`Role error: ${roleError.message}`);

      return authData.user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-users"] });
      toast.success("Siswa berhasil ditambahkan");
      setOpenAddDialog(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Mutation untuk upload massal
  const bulkAddStudents = useMutation({
    mutationFn: async (students: StudentForm[]) => {
      const results = [];
      
      for (const student of students) {
        try {
          // 1. Buat user account
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: student.email,
            password: Math.random().toString(36).slice(-12),
            email_confirm: true,
          });

          if (authError) throw new Error(`${student.email}: ${authError.message}`);

          // 2. Buat profile
          const { error: profileError } = await supabase.from("profiles").insert({
            id: authData.user?.id,
            full_name: student.fullName,
            class_name: student.className,
          });

          if (profileError) throw new Error(`${student.email}: ${profileError.message}`);

          // 3. Set role
          const { error: roleError } = await supabase.from("user_roles").insert({
            user_id: authData.user?.id,
            role: "student",
          });

          if (roleError) throw new Error(`${student.email}: ${roleError.message}`);

          results.push({ status: "success", email: student.email });
        } catch (e: any) {
          results.push({ status: "error", email: student.email, message: e.message });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter(r => r.status === "success").length;
      const failed = results.filter(r => r.status === "error").length;
      
      qc.invalidateQueries({ queryKey: ["all-users"] });
      toast.success(`${successful} siswa ditambahkan${failed > 0 ? `, ${failed} gagal` : ""}`);
      setOpenBulkDialog(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-4xl">Data Siswa</h1>
        <p className="mt-1 text-muted-foreground">Kelola data siswa dan peran pengguna.</p>
      </header>

      {/* Buttons untuk menambah siswa */}
      <div className="mb-6 flex gap-3">
        <Dialog open={openAddDialog} onOpenChange={setOpenAddDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Tambah Siswa Manual
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tambah Siswa</DialogTitle>
              <DialogDescription>Masukkan data siswa baru</DialogDescription>
            </DialogHeader>
            <AddStudentForm onSubmit={(data) => addStudent.mutate(data)} isLoading={addStudent.isPending} />
          </DialogContent>
        </Dialog>

        <Dialog open={openBulkDialog} onOpenChange={setOpenBulkDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload File
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Data Siswa</DialogTitle>
              <DialogDescription>Unggah file CSV dengan kolom: full_name, email, class_name</DialogDescription>
            </DialogHeader>
            <BulkUploadForm onSubmit={(students) => bulkAddStudents.mutate(students)} isLoading={bulkAddStudents.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabel siswa */}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card-soft">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground"><tr className="text-left">
            <th className="p-3">Nama</th><th className="p-3">Email</th><th className="p-3">Kelas</th><th className="p-3">Peran</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const isTeacher = r.roles.includes("teacher");
              const isMe = r.id === user?.id;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">{r.full_name || "—"}</td>
                  <td className="p-3 text-muted-foreground text-xs">{r.email || "—"}</td>
                  <td className="p-3 text-muted-foreground">{r.class_name || "—"}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${isTeacher ? "bg-gradient-gold text-primary" : "bg-secondary text-secondary-foreground"}`}>{isTeacher ? "Guru" : "Siswa"}</span></td>
                  <td className="p-3 text-right">{!isMe && (
                    <Button size="sm" variant="outline" onClick={() => promote.mutate({ userId: r.id, makeTeacher: !isTeacher })}>
                      {isTeacher ? "Cabut Guru" : "Jadikan Guru"}
                    </Button>
                  )}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddStudentForm({ onSubmit, isLoading }: { onSubmit: (data: StudentForm) => void; isLoading: boolean }) {
  const { register, handleSubmit, reset } = useForm<StudentForm>();

  return (
    <form
      onSubmit={handleSubmit((data) => {
        onSubmit(data);
        reset();
      })}
      className="space-y-4"
    >
      <div>
        <Label htmlFor="fullName">Nama Lengkap</Label>
        <Input {...register("fullName", { required: true })} placeholder="Contoh: Ahmad Hidayat" />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input {...register("email", { required: true })} type="email" placeholder="siswa@sekolah.com" />
      </div>
      <div>
        <Label htmlFor="className">Kelas</Label>
        <Input {...register("className", { required: true })} placeholder="Contoh: 7A" />
      </div>
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Menyimpan..." : "Tambah Siswa"}
      </Button>
    </form>
  );
}

function BulkUploadForm({ onSubmit, isLoading }: { onSubmit: (students: StudentForm[]) => void; isLoading: boolean }) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target?.result as string;
        const lines = csv.split("\n").filter(line => line.trim());
        
        if (lines.length < 2) {
          toast.error("File CSV harus memiliki minimal 2 baris (header + data)");
          return;
        }

        // Parse header
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        const nameIdx = headers.indexOf("full_name");
        const emailIdx = headers.indexOf("email");
        const classIdx = headers.indexOf("class_name");

        if (nameIdx === -1 || emailIdx === -1 || classIdx === -1) {
          toast.error("Kolom yang diperlukan: full_name, email, class_name");
          return;
        }

        // Parse data
        const students: StudentForm[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map(v => v.trim());
          if (values.length >= 3) {
            students.push({
              fullName: values[nameIdx],
              email: values[emailIdx],
              className: values[classIdx],
            });
          }
        }

        if (students.length === 0) {
          toast.error("Tidak ada data siswa di file");
          return;
        }

        onSubmit(students);
      } catch (e: any) {
        toast.error(`Error parsing file: ${e.message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="file">Pilih File CSV</Label>
        <Input
          id="file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={isLoading}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Format: CSV dengan kolom <code className="bg-secondary px-1 rounded">full_name</code>, <code className="bg-secondary px-1 rounded">email</code>, <code className="bg-secondary px-1 rounded">class_name</code>
        </p>
      </div>
      <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
        <p className="font-semibold mb-1">Contoh format CSV:</p>
        <code className="block text-xs overflow-x-auto">
          full_name,email,class_name{"\n"}
          Ahmad Hidayat,ahmad@sekolah.com,7A{"\n"}
          Siti Nur,siti@sekolah.com,7A
        </code>
      </div>
      <Button type="button" onClick={() => toast.info("Fitur sedang diproses...")} disabled={isLoading} className="w-full">
        {isLoading ? "Mengupload..." : "Upload"}
      </Button>
    </div>
  );
}
