import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, RefreshCcw, Search, ShieldCheck, Trash2, Pencil, KeyRound,
  ShieldOff, LogOut, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  History, Sparkles,
} from "lucide-react";
import { Navigate } from "react-router-dom";
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
import { cn } from "@/lib/utils";

interface AppUser {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
  roles: string[];
}

interface AuditEntry {
  id: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

type SortKey = "display_name" | "email" | "created_at" | "role";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

async function callFn(name: string, body?: unknown) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function Admin() {
  const { isAdmin, loading, user, logout } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

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

  const loadAudit = async () => {
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast({ title: "Failed to load audit log", description: error.message, variant: "destructive" });
      return;
    }
    setAudit((data ?? []) as AuditEntry[]);
  };

  useEffect(() => { if (isAdmin) { refresh(); loadAudit(); } }, [isAdmin]);

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast({
        title: "Access denied",
        description: "Only administrators can access that page.",
        variant: "destructive",
      });
    }
  }, [loading, isAdmin]);

  const runSeed = async () => {
    setSeeding(true); setSeedResult(null);
    try {
      const data = await callFn("seed-admin");
      const lines = (data.results ?? [])
        .map((r: { email: string; role?: string; status?: string; user_id?: string; error?: string }) =>
          r.error
            ? `✗ ${r.email} — ${r.error}`
            : `✓ ${r.email} — ${r.role ?? "user"} ${r.status ?? "updated"} (${r.user_id?.slice(0, 8)}…)`)
        .join("\n");
      setSeedResult(lines || "Seed completed.");
      toast({ title: "Seed completed", description: `${data.results?.length ?? 0} accounts processed.` });
      await refresh();
    } catch (e) {
      setSeedResult(`Failed: ${String(e)}`);
      toast({ title: "Seed failed", description: String(e), variant: "destructive" });
    } finally { setSeeding(false); }
  };

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = users;
    if (q) {
      list = list.filter((u) =>
        u.email.toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (sortKey === "role") {
        av = a.roles.includes("admin") ? 1 : 0;
        bv = b.roles.includes("admin") ? 1 : 0;
      } else if (sortKey === "created_at") {
        av = new Date(a.created_at).getTime();
        bv = new Date(b.created_at).getTime();
      } else {
        av = (a[sortKey] ?? "").toString().toLowerCase();
        bv = (b[sortKey] ?? "").toString().toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [users, query, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredSorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, sortKey, sortDir]);

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

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

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
      await refresh(); await loadAudit();
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
      await refresh(); await loadAudit();
    } catch (e) { toast({ title: "Update failed", description: String(e), variant: "destructive" }); }
  };

  const toggleAdmin = async (u: AppUser) => {
    const isA = u.roles.includes("admin");
    try {
      await callFn("admin-update-user", {
        action: "set_role", user_id: u.user_id, role: "admin", enabled: !isA,
      });
      toast({ title: isA ? "Admin removed" : "Admin granted" });
      await refresh(); await loadAudit();
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const handleDelete = async (u: AppUser) => {
    try {
      await callFn("admin-update-user", { action: "delete", user_id: u.user_id });
      toast({ title: "User deleted" });
      await refresh(); await loadAudit();
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground font-sans">
      <div className="w-full max-w-5xl mx-auto px-6 pt-12 pb-24 animate-in fade-in duration-300">
        <header className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <img src="/finlo-logo.png" alt="Finlo" className="h-12 w-12 rounded-2xl object-contain" />
            <div>
              <p className="text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-1">Finlo</p>
              <h1 className="font-serif text-4xl font-light tracking-tight leading-none">Admin</h1>
              <p className="text-xs text-ink-muted mt-2">Manage every Finlo user from one place.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" onClick={() => { setAuditOpen(true); loadAudit(); }}
              className="rounded-full h-9 border-border/60"
            >
              <History className="h-3.5 w-3.5 mr-1.5" /> Audit log
            </Button>
            <Button
              variant="ghost" size="sm" onClick={() => logout()}
              className="rounded-full h-9 text-ink-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign out
            </Button>
          </div>
        </header>

        {/* Stats + Seed */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Total users" value={stats.total} />
          <StatCard label="Admins" value={stats.admins} />
          <StatCard label="Standard" value={stats.total - stats.admins} />
          <button
            onClick={runSeed} disabled={seeding}
            className="rounded-2xl border border-border/40 bg-card/40 p-5 text-left hover:bg-card/60 transition-colors disabled:opacity-60"
          >
            <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted mb-2 inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Seed
            </p>
            <p className="font-serif text-base font-light">
              {seeding ? "Seeding…" : "Run seed-admin"}
            </p>
          </button>
        </section>

        {seedResult && (
          <pre className="mb-8 text-xs text-ink-muted bg-card/40 border border-border/40 rounded-2xl p-4 whitespace-pre-wrap">
            {seedResult}
          </pre>
        )}

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
            onClick={() => { refresh(); loadAudit(); }} disabled={busy}
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
                <SortableHead label="User" k="display_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead label="Email" k="email" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead label="Role" k="role" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead label="Joined" k="created_at" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="hidden md:table-cell" />
                <TableHead className="text-right text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((u) => {
                const isMe = u.user_id === user?.id;
                const isA = u.roles.includes("admin");
                return (
                  <TableRow key={u.user_id} className="border-border/30 hover:bg-surface/40 transition-colors">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-surface flex items-center justify-center text-xs font-medium text-foreground/80 border border-border/40">
                          {(u.display_name || u.email).slice(0, 1).toUpperCase()}
                        </div>
                        <p className="text-sm text-foreground flex items-center gap-2">
                          <span className="truncate">{u.display_name || "—"}</span>
                          {isMe && <span className="text-[10px] text-ink-muted">(you)</span>}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-ink-muted">{u.email}</TableCell>
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
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-sm text-ink-muted">
                    {busy ? "Loading…" : query ? "No matches" : "No users yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {filteredSorted.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 text-xs text-ink-muted">
              <span>
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredSorted.length)} of {filteredSorted.length}
              </span>
              <div className="inline-flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-surface disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2">{safePage} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-surface disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Add user dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-background border-border rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-light">Add user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-full bg-surface border-border/60" placeholder="Optional" />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-full bg-surface border-border/60" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-full bg-surface border-border/60" placeholder="Min 6 chars" />
            </Field>
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
              <Field label="Display name">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-full bg-surface border-border/60" />
              </Field>
              <Field label={<span className="inline-flex items-center gap-1.5"><KeyRound className="h-3 w-3" /> New password</span>}>
                <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="rounded-full bg-surface border-border/60" placeholder="Leave blank to keep current" />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} className="rounded-full bg-foreground text-background hover:bg-foreground/90">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit log dialog */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="bg-background border-border rounded-3xl sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-light">Audit log</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto -mx-6 px-6">
            {audit.length === 0 ? (
              <p className="text-sm text-ink-muted py-8 text-center">No actions recorded yet.</p>
            ) : (
              <ul className="space-y-1">
                {audit.map((a) => (
                  <li key={a.id} className="border-b border-border/30 py-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-foreground">{a.action}</span>
                      <span className="text-ink-muted">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-ink-muted mt-1">
                      <span className="text-foreground/70">{a.actor_email ?? "—"}</span>
                      {a.target_email && <> → <span className="text-foreground/70">{a.target_email}</span></>}
                      {a.details && Object.keys(a.details).length > 0 && (
                        <> · <span className="font-mono">{JSON.stringify(a.details)}</span></>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
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

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-ink-muted">{label}</Label>
      {children}
    </div>
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

function SortableHead({
  label, k, sortKey, sortDir, onSort, className,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === k;
  return (
    <TableHead className={cn("text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium", className)}>
      <button
        type="button" onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (sortDir === "asc"
          ? <ChevronUp className="h-3 w-3" />
          : <ChevronDown className="h-3 w-3" />)
          : <ChevronDown className="h-3 w-3 opacity-30" />}
      </button>
    </TableHead>
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
      className={cn(
        "h-8 w-8 inline-flex items-center justify-center rounded-full border border-border/40 text-ink-muted hover:text-foreground hover:bg-surface transition-all disabled:opacity-30 disabled:cursor-not-allowed",
        danger && "hover:text-destructive hover:border-destructive/40",
      )}
    >
      {children}
    </button>
  );
}