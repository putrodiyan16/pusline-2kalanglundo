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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Plus, RotateCcw, Copy } from "lucide-react";
import { useForm } from "react-hook-form";

export const Route = createFileRoute("/_app/manage/students")({
  component: ManageStudentsPage,
});

interface StudentForm {
  fullName: string;
  email: string;
  className: string;
}

interface StudentRow {
  id: string;
  full_name: string;
  email: string;
  class_name: string;
  roles: string[];
}

// Helper untuk generate password
function generatePassword() {
  return Math.random().toString(36).slice(-12);
}

function ManageStudentsPage() {
  const { role, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openBulkDialog, setOpenBulkDialog] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);

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
      const tempPassword = generatePassword();

      // 1. Signup siswa
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: tempPassword,
        options: {
          data: {
            full_name: data.fullName,
            class_name: data.className,
          },
        },
      });

      if (signUpError || !signUpData.user) {
        throw new Error(signUpError?.message || "Gagal membuat user");
      }

      // 2. Confirm email otomatis via admin (jika ada akses admin)
      try {
        await supabase.auth.admin.updateUserById(signUpData.user.id, {
          email_confirm: true,
        });
      } catch (e) {
        // Jika admin tidak tersedia, skip (user masih bisa login)
        console.log("Auto-confirm email skipped");
      }

      // 3. Buat profile
      const { error: profileError } = await supabase.from("profiles").insert({
        id: signUpData.user.id,
        full_name: data.fullName,
        class_name: data.className,
      });

      if (profileError && !profileError.message.includes("duplicate")) {
        throw profileError;
      }

      // 4. Set role sebagai student
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: signUpData.user.id,
        role: "student",
      });

      if (roleError && !roleError.message.includes("duplicate")) {
        throw roleError;
      }

      return { tempPassword, email: data.email };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["all-users"] });
      toast.success(`Siswa berhasil ditambahkan!\nPassword: ${data.tempPassword}`);
      setOpenAddDialog(false);
    },
    onError: (e: any) => toast.error(`Error: ${e.message}`),
  });

  // Mutation untuk upload massal
  const bulkAddStudents = useMutation({
    mutationFn: async (students: StudentForm[]) => {
      const results = [];

      for (const student of students) {
        try {
          const tempPassword = generatePassword();

          // Signup
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: student.email,
            password: tempPassword,
            options: {
              data: {
                full_name: student.fullName,
                class_name: student.className,
              },
            },
          });

          if (signUpError || !signUpData.user) {
            throw new Error(signUpError?.message || "Gagal membuat user");
          }

          // Auto confirm
          try {
            await supabase.auth.admin.updateUserById(signUpData.user.id, {
              email_confirm: true,
            });
          } catch (e) {
            // Skip jika tidak bisa
          }

          // Profile
          await supabase.from("profiles").insert({
            id: signUpData.user.id,
            full_name: student.fullName,
            class_name: student.className,
          });

          // Role
          await supabase.from("user_roles").insert({
            user_id: signUpData.user.id,
            role: "student",
          });

          results.push({
            status: "success",
            email: student.email,
            tempPassword,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          results.push({
            status: "error",
            email: student.email,
            message,
          });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "error").length;

      qc.invalidateQueries({ queryKey: ["all-users"] });

      if (failed > 0) {
        const errorList = results
          .filter((r) => r.status === "error")
          .map((r: any) => `${r.email}: ${r.message}`)
          .join("\n");
        toast.error(`${successful} berhasil, ${failed} gagal:\n${errorList}`);
      } else {
        toast.success(`${successful} siswa berhasil ditambahkan!`);
      }

      setOpenBulkDialog(false);
    },
    onError: (e: any) => toast.error(`Error: ${e.message}`),
  });

  // Mutation untuk reset password
  const resetPassword = useMutation({
    mutationFn: async (studentId: string) => {
      const newPass = generatePassword();

      // Update password via admin API
      const { error } = await supabase.auth.admin.updateUserById(studentId, {
        password: newPass,
      });

      if (error) {
        throw new Error(`Gagal reset password: ${error.message}`);
      }

      return { newPassword: newPass };
    },
    onSuccess: (data) => {
      setNewPassword(data.newPassword);
      toast.success("Password berhasil direset!");
    },
    onError: (e: any) => toast.error(`Error: ${e.message}`),
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
              <DialogDescription>Masukkan data siswa baru. Password akan digenerate otomatis.</DialogDescription>
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
            <th className="p-3">Nama</th><th className="p-3">Email</th><th className="p-3">Kelas</th><th className="p-3">Peran</th><th className="p-3">Aksi</th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map((r: StudentRow) => {
              const isTeacher = r.roles.includes("teacher");
              const isMe = r.id === user?.id;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">{r.full_name || "—"}</td>
                  <td className="p-3 text-muted-foreground text-xs">{r.email || "—"}</td>
                  <td className="p-3 text-muted-foreground">{r.class_name || "—"}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${isTeacher ? "bg-gradient-gold text-primary" : "bg-secondary text-secondary-foreground"}`}>{isTeacher ? "Guru" : "Siswa"}</span></td>
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      {!isTeacher && (
                        <AlertDialog open={resetPasswordId === r.id} onOpenChange={(open) => {
                          if (!open) {
                            setResetPasswordId(null);
                            setNewPassword(null);
                          } else {
                            setResetPasswordId(r.id);
                          }
                        }}>
                          <Button size="sm" variant="outline" className="gap-1" title="Reset password" onClick={() => setResetPasswordId(r.id)}>
                            <RotateCcw className="h-3 w-3" />
                            Reset
                          </Button>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reset Password</AlertDialogTitle>
                              <AlertDialogDescription>
                                {newPassword ? (
                                  <div className="space-y-3 mt-4">
                                    <p>Password baru untuk {r.full_name}:</p>
                                    <div className="flex gap-2 bg-secondary p-2 rounded">
                                      <code className="flex-1 font-mono text-sm">{newPassword}</code>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          navigator.clipboard.writeText(newPassword);
                                          toast.success("Password disalin!");
                                        }}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Simpan password ini dan berikan kepada siswa.</p>
                                  </div>
                                ) : (
                                  `Apakah Anda yakin ingin mereset password untuk ${r.full_name}?`
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogCancel onClick={() => setNewPassword(null)}>
                              {newPassword ? "Tutup" : "Batal"}
                            </AlertDialogCancel>
                            {!newPassword && (
                              <AlertDialogAction
                                onClick={() => resetPassword.mutate(r.id)}
                                disabled={resetPassword.isPending}
                              >
                                {resetPassword.isPending ? "Mereset..." : "Ya, Reset"}
                              </AlertDialogAction>
                            )}
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {!isMe && (
                        <Button size="sm" variant="outline" onClick={() => promote.mutate({ userId: r.id, makeTeacher: !isTeacher })}>
                          {isTeacher ? "Cabut Guru" : "Jadikan Guru"}
                        </Button>
                      )}
                    </div>
                  </td>
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
  const [students, setStudents] = useState<StudentForm[]>([]);

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
        const parsedStudents: StudentForm[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map(v => v.trim());
          if (values.length > Math.max(nameIdx, emailIdx, classIdx) && values[emailIdx]) {
            parsedStudents.push({
              fullName: values[nameIdx],
              email: values[emailIdx],
              className: values[classIdx],
            });
          }
        }

        if (parsedStudents.length === 0) {
          toast.error("Tidak ada data siswa di file");
          return;
        }

        setStudents(parsedStudents);
        toast.success(`${parsedStudents.length} siswa siap diupload`);
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
        <code className="block text-xs overflow-x-auto whitespace-pre">
{`full_name,email,class_name
Ahmad Hidayat,ahmad@sekolah.com,7A
Siti Nur,siti@sekolah.com,7A`}
        </code>
      </div>
      
      {students.length > 0 && (
        <div className="text-xs bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-800">
          <p className="font-semibold text-blue-900 dark:text-blue-100">Siap diupload: {students.length} siswa</p>
          <ul className="mt-1 max-h-32 overflow-y-auto">
            {students.map((s, i) => (
              <li key={i} className="text-blue-800 dark:text-blue-200">• {s.fullName} ({s.email})</li>
            ))}
          </ul>
        </div>
      )}
      
      <Button 
        type="button" 
        onClick={() => {
          if (students.length === 0) {
            toast.error("Silahkan pilih file CSV terlebih dahulu");
            return;
          }
          onSubmit(students);
        }} 
        disabled={isLoading || students.length === 0} 
        className="w-full"
      >
        {isLoading ? "Mengupload..." : `Upload ${students.length > 0 ? `(${students.length} siswa)` : ""}`}
      </Button>
    </div>
  );
}
