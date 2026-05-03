import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCcw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AppUser {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
  roles: string[];
}

async function callFn(name: string, body?: unknown) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function Admin() {
  const { isAdmin, loading, user } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);

  // Add user form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const data = await callFn("admin-list-users");
      setUsers(data.users ?? []);
    } catch (e) {
      toast({ title: "Failed to load users", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  if (loading) return <div className="min-h-dvh flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-ink-muted" /></div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const handleAdd = async () => {
    if (!email.trim() || !password || password.length < 6) {
      toast({ title: "Invalid input", description: "Email + password (min 6 chars) required.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await callFn("admin-create-user", {
        email: email.trim(), password, display_name: name.trim() || undefined,
        role: makeAdmin ? "admin" : "user",
      });
      toast({ title: "User created", description: email });
      setName(""); setEmail(""); setPassword(""); setMakeAdmin(false);
      await refresh();
    } catch (e) {
      toast({ title: "Create failed", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const handleResetPassword = async (u: AppUser) => {
    const np = prompt(`New password for ${u.email}:`);
    if (!np) return;
    if (np.length < 6) { toast({ title: "Too short", variant: "destructive" }); return; }
    try {
      await callFn("admin-update-user", { action: "update", user_id: u.user_id, password: np });
      toast({ title: "Password updated" });
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const handleRename = async (u: AppUser) => {
    const nn = prompt(`New name for ${u.email}:`, u.display_name);
    if (nn === null) return;
    try {
      await callFn("admin-update-user", { action: "update", user_id: u.user_id, display_name: nn.trim() });
      toast({ title: "Name updated" });
      await refresh();
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const toggleAdmin = async (u: AppUser) => {
    const isA = u.roles.includes("admin");
    try {
      await callFn("admin-update-user", {
        action: "set_role", user_id: u.user_id, role: "admin", enabled: !isA,
      });
      toast({ title: isA ? "Admin removed" : "Admin granted" });
      await refresh();
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const handleDelete = async (u: AppUser) => {
    try {
      await callFn("admin-update-user", { action: "delete", user_id: u.user_id });
      toast({ title: "User deleted" });
      await refresh();
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground font-sans">
      <div className="w-full max-w-3xl mx-auto px-6 pt-12 pb-24">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="font-serif text-3xl">Admin</h1>
            <p className="text-xs text-ink-muted mt-1">Manage users for Finlo</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} className="rounded-full">
              <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            <Link to="/" className="text-xs text-ink-muted hover:text-foreground">← Back to app</Link>
          </div>
        </header>

        <section className="mb-10 bg-surface/50 border border-border/40 rounded-3xl p-5">
          <h2 className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium mb-4">
            Add user
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-muted">Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-full bg-background border-border" placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-muted">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-full bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-muted">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-full bg-background border-border" placeholder="Min 6 chars" />
            </div>
            <div className="flex items-end gap-2">
              <label className="text-xs text-ink-muted inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border cursor-pointer">
                <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
                Admin
              </label>
              <Button onClick={handleAdd} disabled={busy} className="rounded-full bg-foreground text-background hover:bg-foreground/90 h-10 ml-auto">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </section>

        <h2 className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium mb-3">
          Users ({users.length})
        </h2>
        <div className="divide-y divide-border/40 border border-border/40 rounded-3xl overflow-hidden">
          {users.map((u) => {
            const isMe = u.user_id === user?.id;
            const isA = u.roles.includes("admin");
            return (
              <div key={u.user_id} className="p-4 flex items-center gap-3 bg-surface/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground flex items-center gap-2">
                    {u.display_name || u.email}
                    {isA && <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase text-accent-foreground bg-accent px-2 py-0.5 rounded-full"><ShieldCheck className="h-3 w-3" />Admin</span>}
                    {isMe && <span className="text-[10px] text-ink-muted">(you)</span>}
                  </p>
                  <p className="text-xs text-ink-muted truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => handleRename(u)}>Rename</Button>
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => handleResetPassword(u)}>Reset pw</Button>
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => toggleAdmin(u)} disabled={isMe}>
                    <UserCog className="h-3.5 w-3.5 mr-1" />{isA ? "Remove admin" : "Make admin"}
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-full text-destructive hover:text-destructive" onClick={() => setConfirmDelete(u)} disabled={isMe}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          {users.length === 0 && !busy && (
            <p className="p-6 text-center text-ink-muted text-sm">No users yet.</p>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-normal">Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete ? `${confirmDelete.email} and all their expenses will be permanently deleted.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDelete) handleDelete(confirmDelete); setConfirmDelete(null); }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
