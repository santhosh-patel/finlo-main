import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, RefreshCcw, Search, ShieldCheck, Trash2, Pencil, KeyRound,
  ShieldOff, LogOut, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  History, Eye, EyeOff, Moon, Sun, Monitor, UserX, UserCheck, Copy, Download,
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
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { validatePassword } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";

interface AppUser {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
  roles: string[];
  disabled?: boolean;
  banned_until?: string | null;
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

const PAGE_SIZE = 10; // UI rows per page (separate from server page size)

async function callFn(name: string, body?: unknown) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function formatFnError(name: string, err: unknown): string {
  if (err instanceof FunctionsFetchError) {
    return `Network error calling ${name}. If this is a 404 in the network tab, deploy it: npx supabase functions deploy ${name}`;
  }
  if (err instanceof FunctionsRelayError) return `Supabase relay error calling ${name}: ${err.message}`;
  if (err instanceof FunctionsHttpError) {
    const status = (err.context as Response | undefined)?.status;
    if (status === 404) return `Function ${name} is not deployed. Run: npx supabase functions deploy ${name}`;
    if (status === 401) return `Unauthorized calling ${name}. Sign in again.`;
    if (status === 403) return `Forbidden calling ${name}. Ensure your user has admin role.`;
    return `Edge Function ${name} returned HTTP ${status ?? "error"}.`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export default function Admin() {
  const { isAdmin, loading, user, logout } = useAuth();
  const { theme, update: updateTheme } = useTheme();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // Add user form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [makeAdmin, setMakeAdmin] = useState(false);

  const [serverPage, setServerPage] = useState(1);
  const [serverHasMore, setServerHasMore] = useState(false);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").split('"').join('""')}"`;
    const rows = [
      ["user_id", "email", "display_name", "created_at", "roles", "disabled", "banned_until"],
      ...users.map((u) => [
        u.user_id,
        u.email,
        u.display_name,
        u.created_at,
        u.roles.join("|"),
        u.disabled ? "true" : "false",
        u.banned_until ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finlo-users-page-${serverPage}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refresh = async (p = serverPage) => {
    setBusy(true);
    try {
      const data = await callFn("admin-list-users", { page: p, perPage: 50 });
      setUsers(data.users ?? []);
      setServerPage(data.page ?? p);
      setServerHasMore(!!data.hasMore);
    } catch (e) {
      toast({ title: "Failed to load users", description: formatFnError("admin-list-users", e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const loadAudit = async (p = auditPage) => {
    const pageSize = 30;
    let q = supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .range((p - 1) * pageSize, p * pageSize);

    const text = auditQuery.trim();
    if (text) {
      // Search across actor email + target email (OR)
      q = q.or(`actor_email.ilike.%${text}%,target_email.ilike.%${text}%`);
    }
    const action = auditAction.trim();
    if (action) q = q.ilike("action", `%${action}%`);
    if (auditFrom) q = q.gte("created_at", `${auditFrom}T00:00:00`);
    if (auditTo) q = q.lte("created_at", `${auditTo}T23:59:59`);

    const { data, error } = await q;
    if (error) {
      toast({ title: "Failed to load audit log", description: error.message, variant: "destructive" });
      return;
    }
    setAudit((data ?? []) as AuditEntry[]);
    setAuditPage(p);
    setAuditHasMore((data ?? []).length > pageSize);
  };

  useEffect(() => { if (isAdmin) { refresh(1); loadAudit(); } }, [isAdmin]);

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast({
        title: "Access denied",
        description: "Only administrators can access that page.",
        variant: "destructive",
      });
    }
  }, [loading, isAdmin]);

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
    if (!email.trim() || !password) {
      toast({ title: "Invalid input", description: "Email and password required.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please re-enter the confirm password.", variant: "destructive" });
      return;
    }
    const pwdErr = validatePassword(password);
    if (pwdErr) {
      toast({ title: "Weak password", description: pwdErr, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await callFn("admin-create-user", {
        email: email.trim(), password, display_name: name.trim() || undefined,
        role: makeAdmin ? "admin" : "user",
      });
      toast({ title: "User created", description: email });
      setName(""); setEmail(""); setPassword(""); setConfirmPassword("");
      setShowPassword(false); setShowConfirmPassword(false);
      setMakeAdmin(false); setAddOpen(false);
      await refresh(); await loadAudit();
    } catch (e) {
      toast({ title: "Create failed", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const openEdit = (u: AppUser) => {
    setEditing(u); setEditName(u.display_name ?? ""); setEditPassword(""); setShowEditPassword(false);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const patch: Record<string, unknown> = { action: "update", user_id: editing.user_id };
    if (editName.trim() !== (editing.display_name ?? "")) patch.display_name = editName.trim();
    if (editPassword) {
      const pwdErr = validatePassword(editPassword);
      if (pwdErr) { toast({ title: "Weak password", description: pwdErr, variant: "destructive" }); return; }
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
    } catch (e) { toast({ title: "Failed", description: formatFnError("admin-update-user", e), variant: "destructive" }); }
  };

  const toggleDisabled = async (u: AppUser) => {
    const isMe = u.user_id === user?.id;
    if (isMe) {
      toast({ title: "Not allowed", description: "You cannot disable your own account.", variant: "destructive" });
      return;
    }
    try {
      await callFn("admin-update-user", { action: "set_disabled", user_id: u.user_id, enabled: u.disabled });
      toast({ title: u.disabled ? "User enabled" : "User disabled" });
      await refresh(); await loadAudit();
    } catch (e) { toast({ title: "Failed", description: formatFnError("admin-update-user", e), variant: "destructive" }); }
  };

  const generateRecoveryLink = async (u: AppUser) => {
    try {
      const data = await callFn("admin-update-user", { action: "generate_link", user_id: u.user_id, link_type: "recovery" });
      const link = data?.link as string | null;
      if (!link) {
        toast({ title: "No link returned", description: "Supabase did not return a recovery link.", variant: "destructive" });
        return;
      }
      try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
      toast({ title: "Password reset link generated", description: "Copied to clipboard." });
      await loadAudit();
    } catch (e) { toast({ title: "Failed", description: formatFnError("admin-update-user", e), variant: "destructive" }); }
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `Copied ${label}` });
    } catch {
      toast({ title: "Copy failed", description: value, variant: "destructive" });
    }
  };

  const handleDelete = async (u: AppUser) => {
    try {
      await callFn("admin-update-user", { action: "delete", user_id: u.user_id });
      toast({ title: "User deleted" });
      await refresh(); await loadAudit();
    } catch (e) { toast({ title: "Failed", description: formatFnError("admin-update-user", e), variant: "destructive" }); }
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
              variant="outline"
              size="sm"
              onClick={() => updateTheme({ mode: theme.mode === "dark" ? "light" : "dark" })}
              className="rounded-full h-9 border-border/60"
              title="Toggle theme"
            >
              {theme.mode === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateTheme({ mode: "system" })}
              className={cn("rounded-full h-9 border-border/60", theme.mode === "system" && "bg-surface")}
              title="System theme"
            >
              <Monitor className="h-3.5 w-3.5" />
            </Button>
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

        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
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
            onClick={() => { refresh(); loadAudit(); }} disabled={busy}
            className="rounded-full h-10 px-4 border-border/60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv()}
            disabled={busy || users.length === 0}
            className="rounded-full h-10 px-4 border-border/60"
            title="Export current list to CSV"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm" onClick={() => setAddOpen(true)}
            className="rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add user
          </Button>
        </section>

        {/* Users Table */}
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
                      <div className="flex items-center gap-2 justify-end sm:justify-start">
                        {isA ? (
                          <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase text-accent-foreground bg-accent px-2.5 py-1 rounded-full">
                            <ShieldCheck className="h-3 w-3" /> Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] tracking-wider uppercase text-ink-muted bg-surface px-2.5 py-1 rounded-full border border-border/40">
                            User
                          </span>
                        )}
                        {u.disabled && (
                          <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase text-destructive bg-destructive/10 px-2.5 py-1 rounded-full border border-destructive/20">
                            Disabled
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-ink-muted">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <IconBtn label="Edit" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn label={u.disabled ? "Enable user" : "Disable user"} onClick={() => toggleDisabled(u)} disabled={isMe} danger={!!u.disabled}>
                          {u.disabled ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                        </IconBtn>
                        <IconBtn label="Generate password reset link" onClick={() => generateRecoveryLink(u)}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn label="Copy email" onClick={() => copyText("email", u.email)}>
                          <Copy className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn label="Copy user id" onClick={() => copyText("user id", u.user_id)}>
                          <Copy className="h-3.5 w-3.5" />
                        </IconBtn>
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

          {/* Pagination (client-side for current server page) */}
          {filteredSorted.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 text-xs text-ink-muted">
              <span>Server page {serverPage}{serverHasMore ? "+" : ""} · {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredSorted.length)} of {filteredSorted.length}</span>
              <div className="inline-flex items-center gap-1">
                <button
                  onClick={() => refresh(Math.max(1, serverPage - 1))}
                  disabled={busy || serverPage === 1}
                  className="h-7 px-2 inline-flex items-center justify-center rounded-full hover:bg-surface disabled:opacity-30"
                  aria-label="Previous server page"
                >
                  Server prev
                </button>
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
                <button
                  onClick={() => refresh(serverPage + 1)}
                  disabled={busy || !serverHasMore}
                  className="h-7 px-2 inline-flex items-center justify-center rounded-full hover:bg-surface disabled:opacity-30"
                  aria-label="Next server page"
                >
                  Server next
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Audit Log (inline section) */}
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-2xl font-light">Activity log</h2>
            <div className="flex items-center gap-2">
              <Input
                value={auditQuery}
                onChange={(e) => setAuditQuery(e.target.value)}
                placeholder="Search actor/target…"
                className="hidden sm:block w-52 rounded-full bg-surface border-border/60 h-8 text-xs"
              />
              <Input
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
                placeholder="Action…"
                className="hidden sm:block w-36 rounded-full bg-surface border-border/60 h-8 text-xs"
              />
              <Input
                type="date"
                value={auditFrom}
                onChange={(e) => setAuditFrom(e.target.value)}
                className="hidden md:block w-36 rounded-full bg-surface border-border/60 h-8 text-xs"
                title="From date"
              />
              <Input
                type="date"
                value={auditTo}
                onChange={(e) => setAuditTo(e.target.value)}
                className="hidden md:block w-36 rounded-full bg-surface border-border/60 h-8 text-xs"
                title="To date"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadAudit(1)}
                className="rounded-full h-8 px-3 border-border/60 text-xs"
              >
                <RefreshCcw className="h-3 w-3 mr-1.5" /> Apply
              </Button>
            </div>
          </div>
          <div className="border border-border/50 rounded-3xl overflow-hidden bg-card/40">
            {audit.length === 0 ? (
              <p className="text-sm text-ink-muted py-10 text-center">No actions recorded yet.</p>
            ) : (
              <div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
                {audit.map((a) => (
                  <div key={a.id} className="px-5 py-3.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-foreground font-medium">{a.action}</span>
                      <span className="text-ink-muted shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-ink-muted mt-1">
                      <span className="text-foreground/70">{a.actor_email ?? "—"}</span>
                      {a.target_email && <> → <span className="text-foreground/70">{a.target_email}</span></>}
                      {a.details && Object.keys(a.details).length > 0 && (
                        <>
                          <span className="mx-2 text-border/60">•</span>
                          <span className="font-mono text-ink-muted/80 break-all">{JSON.stringify(a.details)}</span>
                        </>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 mt-3 text-xs text-ink-muted">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full h-8 px-3 border-border/60 text-xs"
              onClick={() => loadAudit(Math.max(1, auditPage - 1))}
              disabled={auditPage === 1}
            >
              Prev
            </Button>
            <span className="px-1">Page {auditPage}{auditHasMore ? "+" : ""}</span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full h-8 px-3 border-border/60 text-xs"
              onClick={() => loadAudit(auditPage + 1)}
              disabled={!auditHasMore}
            >
              Next
            </Button>
          </div>
        </section>
      </div>

      {/* Add user dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) { setShowPassword(false); setShowConfirmPassword(false); } setAddOpen(v); }}>
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
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-full bg-surface border-border/60 pr-10"
                  placeholder="Strong password required"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="Confirm password">
              <div className="relative">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={cn(
                    "rounded-full bg-surface border-border/60 pr-10",
                    confirmPassword && password !== confirmPassword && "border-destructive/60 focus-visible:ring-destructive/30"
                  )}
                  placeholder="Re-enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-[11px] text-destructive mt-1 pl-3">Passwords don't match</p>
              )}
            </Field>
            <label className="text-xs text-ink-muted inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border/60 cursor-pointer">
              <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
              Grant admin role
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={busy || (!!confirmPassword && password !== confirmPassword)}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="h-4 w-4 mr-1" /> Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) { setEditing(null); setShowEditPassword(false); } }}>
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
                <div className="relative">
                  <Input
                    type={showEditPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="rounded-full bg-surface border-border/60 pr-10"
                    placeholder="Leave blank to keep current"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} className="rounded-full bg-foreground text-background hover:bg-foreground/90">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit log dialog (kept for header button) */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="bg-background border-border rounded-3xl sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-light">Full audit log</DialogTitle>
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
