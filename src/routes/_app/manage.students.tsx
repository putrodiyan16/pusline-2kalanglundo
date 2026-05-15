import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/manage/students")({
  component: ManageStudentsPage,
});

function ManageStudentsPage() {
  const { role, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-4xl">Data Pengguna</h1>
        <p className="mt-1 text-muted-foreground">Kelola peran guru/siswa.</p>
      </header>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card-soft">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground"><tr className="text-left">
            <th className="p-3">Nama</th><th className="p-3">Kelas</th><th className="p-3">Peran</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const isTeacher = r.roles.includes("teacher");
              const isMe = r.id === user?.id;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">{r.full_name || "—"}</td>
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