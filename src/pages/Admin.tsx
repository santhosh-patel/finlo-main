import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCcw, Search, ShieldCheck, Trash2, Pencil, KeyRound, ShieldOff } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [addOpen, setAddOpen] = useState(false);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.email.toLowerCase().includes(q) ||
      (u.display_name ?? "").toLowerCase().includes(q),
    );
  }, [query, users]);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.roles.includes("admin")).length,
  }), [users]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }
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
      setName(""); setEmail(""); setPassword(""); setMakeAdmin(false); setAddOpen(false);
      await refresh();
    } catch (e) {
      toast({ title: "Create failed", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const openEdit = (u: AppUser) => {
    setEditing(u); setEditName(u.display_name ?? ""); setEditPassword("");
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const patch: Record<string, unknown> = { action: "update", user_id: editing.user_id };
    if (editName.trim() !== (editing.display_name ?? "")) patch.display_name = editName.trim();
    if (editPassword) {
      if (editPassword.length < 6) { toast({ title: "Password too short", variant: "destructive" }); return; }
      patch.password = editPassword;
    }
    if (Object.keys(patch).length === 2) { setEditing(null); return; }
    try {
      await callFn("admin-update-user", patch);
      toast({ title: "User updated" });
      setEditing(null);
      await refresh();
    } catch (e) { toast({ title: "Update failed", description: String(e), variant: "destructive" }); }
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
      <div className="w-full max-w-5xl mx-auto px-6 pt-12 pb-24 animate-in fade-in duration-300">
        <header className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <p className="text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2">Finlo</p>
            <h1 className="font-serif text-4xl font-light tracking-tight">Admin</h1>
            <p className="text-sm text-ink-muted mt-2">Manage every Finlo user from one place.</p>
          </div>
          <Link to="/" className="text-xs text-ink-muted hover:text-foreground transition-colors">
            ← Back to app
          </Link>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
          <StatCard label="Total users" value={stats.total} />
          <StatCard label="Admins" value={stats.admins} />
          <StatCard label="Standard" value={stats.total - stats.admins} />
        </section>

        {/* Toolbar */}
        <section className="flex items-center gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-9 rounded-full bg-surface border-border/60 h-10"
            />
          </div>
          <Button
            variant="outline" size="sm"
            onClick={refresh} disabled={busy}
            className="rounded-full h-10 px-4 border-border/60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm" onClick={() => setAddOpen(true)}
            className="rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add user
          </Button>
        </section>

        {/* Table */}
        <section className="border border-border/50 rounded-3xl overflow-hidden bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium">User</TableHead>
                <TableHead className="text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium">Role</TableHead>
                <TableHead className="text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium hidden md:table-cell">Joined</TableHead>
                <TableHead className="text-right text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const isMe = u.user_id === user?.id;
                const isA = u.roles.includes("admin");
                return (
                  <TableRow key={u.user_id} className="border-border/30 hover:bg-surface/40 transition-colors">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-surface flex items-center justify-center text-xs font-medium text-foreground/80 border border-border/40">
                          {(u.display_name || u.email).slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-foreground flex items-center gap-2">
                            <span className="truncate">{u.display_name || "—"}</span>
                            {isMe && <span className="text-[10px] text-ink-muted">(you)</span>}
                          </p>
                          <p className="text-xs text-ink-muted truncate">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isA ? (
                        <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase text-accent-foreground bg-accent px-2.5 py-1 rounded-full">
                          <ShieldCheck className="h-3 w-3" /> Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] tracking-wider uppercase text-ink-muted bg-surface px-2.5 py-1 rounded-full border border-border/40">
                          User
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-ink-muted">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <IconBtn label="Edit" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn
                          label={isA ? "Revoke admin" : "Make admin"}
                          onClick={() => toggleAdmin(u)} disabled={isMe}
                        >
                          {isA ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        </IconBtn>
                        <IconBtn
                          label="Delete" onClick={() => setConfirmDelete(u)} disabled={isMe} danger
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-sm text-ink-muted">
                    {busy ? "Loading…" : query ? "No matches" : "No users yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      {/* Add user dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-background border-border rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-light">Add user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-muted">Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-full bg-surface border-border/60" placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-muted">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-full bg-surface border-border/60" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-muted">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-full bg-surface border-border/60" placeholder="Min 6 chars" />
            </div>
            <label className="text-xs text-ink-muted inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border/60 cursor-pointer">
              <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
              Grant admin role
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={busy} className="rounded-full bg-foreground text-background hover:bg-foreground/90">
              <Plus className="h-4 w-4 mr-1" /> Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="bg-background border-border rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-light">Edit user</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-ink-muted">{editing.email}</p>
              <div className="space-y-1.5">
                <Label className="text-xs text-ink-muted">Display name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-full bg-surface border-border/60" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-ink-muted flex items-center gap-1.5">
                  <KeyRound className="h-3 w-3" /> New password
                </Label>
                <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="rounded-full bg-surface border-border/60" placeholder="Leave blank to keep current" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} className="rounded-full bg-foreground text-background hover:bg-foreground/90">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent className="bg-background border-border rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-light">Delete user?</AlertDialogTitle>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
      <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted mb-2">{label}</p>
      <p className="font-serif text-3xl font-light">{value}</p>
    </div>
  );
}

function IconBtn({
  children, onClick, label, disabled, danger,
}: {
  children: React.ReactNode; onClick: () => void; label: string;
  disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`h-8 w-8 inline-flex items-center justify-center rounded-full border border-border/40 text-ink-muted hover:text-foreground hover:bg-surface transition-all disabled:opacity-30 disabled:cursor-not-allowed ${danger ? "hover:text-destructive hover:border-destructive/40" : ""}`}
    >
      {children}
    </button>
  );
}
