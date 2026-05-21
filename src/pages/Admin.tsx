import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, RefreshCcw, Search, ShieldCheck, Trash2, Pencil, KeyRound,
  ShieldOff, LogOut, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  History, Eye, EyeOff, Moon, Sun, Monitor, UserX, UserCheck, Copy, Download,
  Lock, Activity, Settings2, Globe, ShieldAlert, BadgeInfo, MoreVertical,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar,
} from "recharts";
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
import { cn, vibrate } from "@/lib/utils";
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

const PAGE_SIZE = 10;

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
  const { isAdmin, loading, user, logout, impersonate, impersonatedUserId, impersonatedEmail, stopImpersonating } = useAuth();
  const { theme, update: updateTheme, isDark } = useTheme();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"users" | "metrics" | "workflow">("users");

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

  // Workflow Gates Local Sync
  const [maintenanceMode, setMaintenanceMode] = useState(() => {
    return localStorage.getItem("finlo_config_maintenance") === "true";
  });
  const [inviteOnly, setInviteOnly] = useState(() => {
    return localStorage.getItem("finlo_config_invite") === "true";
  });
  const [voiceLimitEnabled, setVoiceLimitEnabled] = useState(() => {
    return localStorage.getItem("finlo_config_voice_limit") === "true";
  });
  const [excelImportEnabled, setExcelImportEnabled] = useState(() => {
    return localStorage.getItem("finlo_config_excel_import") !== "false";
  });

  // Global Notification Broadcast variables
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [notifKind, setNotifKind] = useState("broadcast");
  const [notifLink, setNotifLink] = useState("");

  const handleBroadcast = async () => {
    if (!notifTitle.trim() || !notifBody.trim()) return;
    setBusy(true);
    try {
      const resData = await callFn("admin-update-user", {
        action: "broadcast_notification",
        title: notifTitle.trim(),
        body: notifBody.trim(),
        kind: notifKind,
        link: notifLink.trim() || undefined,
      });
      toast({
        title: "Announcement Broadcasted!",
        description: `Successfully delivered announcement to ${resData.recipientCount ?? 0} active users.`,
      });
      setNotifTitle("");
      setNotifBody("");
      setNotifLink("");
      setNotifKind("broadcast");
      await loadAudit(1);
    } catch (e) {
      toast({
        title: "Broadcast failed",
        description: String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

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

  // Analytics Curve Generation
  const userGrowthChartData = useMemo(() => {
    const sorted = [...users].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const dailyMap: Record<string, number> = {};
    sorted.forEach((u) => {
      const dayStr = new Date(u.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      dailyMap[dayStr] = (dailyMap[dayStr] || 0) + 1;
    });

    let runningTotal = 0;
    return Object.entries(dailyMap).map(([date, count]) => {
      runningTotal += count;
      return { date, count, total: runningTotal };
    });
  }, [users]);

  const activityTrendData = useMemo(() => {
    const dailyMap: Record<string, number> = {};
    const sorted = [...audit].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    sorted.forEach((a) => {
      const dayStr = new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      dailyMap[dayStr] = (dailyMap[dayStr] || 0) + 1;
    });

    return Object.entries(dailyMap).map(([date, count]) => ({
      date,
      activities: count,
    }));
  }, [audit]);

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

  const handleImpersonate = (u: AppUser) => {
    vibrate(15);
    impersonate(u.user_id, u.email, u.display_name ?? u.email.split("@")[0]);
    toast({
      title: "Impersonation session active",
      description: `Now viewing ledger for ${u.email} in read-only sandbox mode.`,
    });
    navigate("/");
  };

  // Toggle Workflow Config Settings
  const toggleWorkflowConfig = (key: "maintenance" | "invite" | "voice_limit" | "excel_import") => {
    vibrate(10);
    if (key === "maintenance") {
      const next = !maintenanceMode;
      setMaintenanceMode(next);
      localStorage.setItem("finlo_config_maintenance", String(next));
      toast({
        title: next ? "Maintenance Mode Activated" : "Maintenance Mode Disabled",
        description: next ? "Standard user dashboards are locked." : "Standard user dashboards unlocked.",
      });
    } else if (key === "invite") {
      const next = !inviteOnly;
      setInviteOnly(next);
      localStorage.setItem("finlo_config_invite", String(next));
      toast({
        title: next ? "Invite-Only Enforced" : "Signups Open Globally",
        description: next ? "Unlocked via admin approval." : "Anyone can enroll directly.",
      });
    } else if (key === "voice_limit") {
      const next = !voiceLimitEnabled;
      setVoiceLimitEnabled(next);
      localStorage.setItem("finlo_config_voice_limit", String(next));
      toast({
        title: next ? "Voice AI caps turned on" : "Voice AI unlimited",
        description: next ? "Standard rate limits applied to Maya AI." : "Unlimited transcript sessions allowed.",
      });
    } else if (key === "excel_import") {
      const next = !excelImportEnabled;
      setExcelImportEnabled(next);
      localStorage.setItem("finlo_config_excel_import", String(next));
      toast({
        title: next ? "Excel/CSV upload enabled" : "Excel/CSV upload disabled",
        description: next ? "Standard spreadsheet imports unlocked." : "Bulk upload locks applied.",
      });
    }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground font-sans">
      <div className="w-full max-w-5xl mx-auto px-6 pt-12 pb-24 animate-in fade-in duration-300">
        <header className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <img src="/finlo-logo.png" alt="Finlo" className="h-12 w-12 rounded-2xl object-contain" />
            <div>
              <p className="text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-1">Finlo AI</p>
              <h1 className="font-serif text-4xl font-light tracking-tight leading-none">Command Center</h1>
              <p className="text-xs text-ink-muted mt-2">Manage application policies, standard users, and active workflows.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {impersonatedUserId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  stopImpersonating();
                  toast({ title: "Impersonation session ended", description: "You are now back in standard Admin mode." });
                }}
                className="rounded-full h-9 bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20 mr-1 text-xs font-semibold"
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Stop Impersonating
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const next = isDark ? "light" : "dark";
                updateTheme(
                  { mode: next },
                  { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
                );
              }}
              className="rounded-full h-9 border-border/60"
              title="Toggle light / dark"
            >
              {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
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

        {/* Dynamic Navigation sliding tab bar */}
        <div className="mb-8 max-w-sm">
          <nav className="relative flex gap-1 bg-surface rounded-full p-1 text-xs overflow-hidden border border-border/40 select-none">
            {/* Sliding indicator */}
            <div 
              className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1.1)]"
              style={{
                width: "calc((100% - 8px) / 3)",
                transform: `translateX(${
                  activeTab === "users" ? "0%"
                  : activeTab === "metrics" ? "calc(100% + 4px)"
                  : "calc(200% + 8px)"
                })`
              }}
            />
            <button
              onClick={() => { vibrate(10); setActiveTab("users"); }}
              className={cn(
                "relative z-10 flex-1 px-3 py-2 rounded-full uppercase tracking-wider transition-colors font-medium text-center",
                activeTab === "users" ? "text-foreground font-semibold" : "text-ink-muted hover:text-foreground"
              )}
            >
              Users
            </button>
            <button
              onClick={() => { vibrate(10); setActiveTab("metrics"); }}
              className={cn(
                "relative z-10 flex-1 px-3 py-2 rounded-full uppercase tracking-wider transition-colors font-medium text-center",
                activeTab === "metrics" ? "text-foreground font-semibold" : "text-ink-muted hover:text-foreground"
              )}
            >
              Analytics
            </button>
            <button
              onClick={() => { vibrate(10); setActiveTab("workflow"); }}
              className={cn(
                "relative z-10 flex-1 px-3 py-2 rounded-full uppercase tracking-wider transition-colors font-medium text-center",
                activeTab === "workflow" ? "text-foreground font-semibold" : "text-ink-muted hover:text-foreground"
              )}
            >
              Workflow
            </button>
          </nav>
        </div>

        {/* TAB 1: USERS PANEL */}
        {activeTab === "users" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Stats */}
            <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Total users" value={stats.total} />
              <StatCard label="Admins" value={stats.admins} />
              <StatCard label="Standard" value={stats.total - stats.admins} />
            </section>

            {/* Toolbar */}
            <section className="flex items-center gap-2">
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
            <section className="border border-border/50 rounded-3xl overflow-hidden bg-card/40 shadow-sm">
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
                            <div className="h-9 w-9 rounded-full bg-surface flex items-center justify-center text-xs font-medium text-foreground/80 border border-border/40 shrink-0">
                              {(u.display_name || u.email).slice(0, 1).toUpperCase()}
                            </div>
                            <p className="text-sm text-foreground flex items-center gap-2">
                              <span className="truncate max-w-[120px] sm:max-w-none">{u.display_name || "—"}</span>
                              {isMe && <span className="text-[10px] text-ink-muted shrink-0">(you)</span>}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-ink-muted">{u.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 justify-end sm:justify-start">
                            {isA ? (
                              <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase text-accent-foreground bg-accent px-2.5 py-1 rounded-full shrink-0">
                                <ShieldCheck className="h-3 w-3" /> Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[10px] tracking-wider uppercase text-ink-muted bg-surface px-2.5 py-1 rounded-full border border-border/40 shrink-0">
                                User
                              </span>
                            )}
                            {u.disabled && (
                              <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase text-destructive bg-destructive/10 px-2.5 py-1 rounded-full border border-destructive/20 shrink-0 animate-pulse">
                                Disabled
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-ink-muted">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {/* Impersonate Ledger (Primary High-value action shown directly) */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleImpersonate(u)}
                              disabled={isMe}
                              className="h-8 rounded-full border-amber-500/20 text-amber-500 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/30 text-[11px] font-medium px-2.5 sm:px-3 flex items-center gap-1.5 shrink-0"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Inspect</span>
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border/40 text-ink-muted hover:text-foreground hover:bg-surface transition-colors"
                                  title="Actions"
                                  aria-label="More actions"
                                >
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-background border-border rounded-2xl min-w-[170px] p-1.5 shadow-lg z-50">
                                <DropdownMenuItem onClick={() => openEdit(u)} className="rounded-xl flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium cursor-pointer">
                                  <Pencil className="h-3.5 w-3.5 text-ink-muted" />
                                  Edit profile
                                </DropdownMenuItem>
                                
                                <DropdownMenuItem onClick={() => toggleDisabled(u)} disabled={isMe} className="rounded-xl flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium cursor-pointer">
                                  {u.disabled ? (
                                    <>
                                      <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                                      <span className="text-emerald-500">Enable user</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserX className="h-3.5 w-3.5 text-ink-muted" />
                                      <span>Disable user</span>
                                    </>
                                  )}
                                </DropdownMenuItem>

                                <DropdownMenuItem onClick={() => toggleAdmin(u)} disabled={isMe} className="rounded-xl flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium cursor-pointer">
                                  {isA ? (
                                    <>
                                      <ShieldOff className="h-3.5 w-3.5 text-ink-muted" />
                                      <span>Revoke Admin</span>
                                    </>
                                  ) : (
                                    <>
                                      <ShieldCheck className="h-3.5 w-3.5 text-accent-foreground" />
                                      <span>Make Admin</span>
                                    </>
                                  )}
                                </DropdownMenuItem>

                                <DropdownMenuItem onClick={() => generateRecoveryLink(u)} className="rounded-xl flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium cursor-pointer">
                                  <KeyRound className="h-3.5 w-3.5 text-ink-muted" />
                                  Password Reset
                                </DropdownMenuItem>

                                <DropdownMenuItem onClick={() => copyText("User ID", u.user_id)} className="rounded-xl flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium cursor-pointer">
                                  <Copy className="h-3.5 w-3.5 text-ink-muted" />
                                  Copy User ID
                                </DropdownMenuItem>

                                <DropdownMenuSeparator className="bg-border/40 my-1" />

                                <DropdownMenuItem onClick={() => setConfirmDelete(u)} disabled={isMe} className="rounded-xl flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete user
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                  <span>Server page {serverPage}{serverHasMore ? "+" : ""} · {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredSorted.length)} of {filteredSorted.length}</span>
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => refresh(Math.max(1, serverPage - 1))}
                      disabled={busy || serverPage === 1}
                      className="h-7 px-2 inline-flex items-center justify-center rounded-full hover:bg-surface disabled:opacity-30"
                    >
                      Server prev
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-surface disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-2">{safePage} / {totalPages}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-surface disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => refresh(serverPage + 1)}
                      disabled={busy || !serverHasMore}
                      className="h-7 px-2 inline-flex items-center justify-center rounded-full hover:bg-surface disabled:opacity-30"
                    >
                      Server next
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: ANALYTICS & METRICS */}
        {activeTab === "metrics" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* System Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl border border-border/40 bg-card/40 flex items-center gap-4">
                <div className="h-10 w-10 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center border border-emerald-500/20 shadow-sm">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] tracking-wider uppercase text-ink-muted">Server Status</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">Online & Healthy</p>
                </div>
              </div>
              <div className="p-5 rounded-2xl border border-border/40 bg-card/40 flex items-center gap-4">
                <div className="h-10 w-10 bg-indigo-500/10 text-indigo-500 rounded-xl flex items-center justify-center border border-indigo-500/20 shadow-sm">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] tracking-wider uppercase text-ink-muted">Total Events Logged</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{audit.length} Audit Traces</p>
                </div>
              </div>
              <div className="p-5 rounded-2xl border border-border/40 bg-card/40 flex items-center gap-4">
                <div className="h-10 w-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center border border-amber-500/20 shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] tracking-wider uppercase text-ink-muted">Security Audits</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">100% Secure SSL</p>
                </div>
              </div>
            </div>

            {/* Recharts Area Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 rounded-3xl border border-border/40 bg-card/30">
                <h3 className="text-sm font-semibold text-foreground mb-4 font-serif">Cumulative User Enrollment Curve</h3>
                <div className="h-64 w-full text-xs font-mono">
                  {userGrowthChartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-ink-muted">No data available</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={userGrowthChartData}>
                        <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--foreground))" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="hsl(var(--foreground))" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" stroke="currentColor" opacity={0.3} fontSize={10} tickLine={false} />
                        <YAxis stroke="currentColor" opacity={0.3} fontSize={10} tickLine={false} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "1rem" }} />
                        <Area type="monotone" dataKey="total" stroke="hsl(var(--foreground))" strokeWidth={1.5} fillOpacity={1} fill="url(#colorTotal)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="p-6 rounded-3xl border border-border/40 bg-card/30">
                <h3 className="text-sm font-semibold text-foreground mb-4 font-serif">Daily Administrative Audit Traffic</h3>
                <div className="h-64 w-full text-xs font-mono">
                  {activityTrendData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-ink-muted">No audit events generated yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activityTrendData}>
                        <defs>
                          <linearGradient id="colorActivities" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" stroke="currentColor" opacity={0.3} fontSize={10} tickLine={false} />
                        <YAxis stroke="currentColor" opacity={0.3} fontSize={10} tickLine={false} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "1rem" }} />
                        <Area type="monotone" dataKey="activities" stroke="hsl(var(--foreground))" strokeWidth={1.5} fillOpacity={1} fill="url(#colorActivities)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WORKFLOW CONFIG CONSOLE */}
        {activeTab === "workflow" && (
          <div className="space-y-6 max-w-2xl animate-in fade-in duration-300">
            <div className="p-5 rounded-3xl border border-border/40 bg-card/30 space-y-5">
              <div className="flex items-center gap-3 border-b border-border/20 pb-3">
                <Settings2 className="h-5 w-5 text-ink-muted" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Global Control Panel</h3>
                  <p className="text-[11px] text-ink-muted">Adjust system gates, restrictions, and core app operational settings instantly.</p>
                </div>
              </div>

              {/* Maintenance Toggle */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-background/50 border border-border/30">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground">Global System Maintenance Mode</p>
                    {maintenanceMode && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                    )}
                  </div>
                  <p className="text-[11px] text-ink-muted pr-2">Lock standard users out with a gorgeous Scheduled Maintenance lock card. Allows admins to bypass freely to inspect the UI.</p>
                </div>
                <Button 
                  size="sm"
                  variant={maintenanceMode ? "destructive" : "outline"}
                  onClick={() => toggleWorkflowConfig("maintenance")}
                  className="rounded-full h-9 px-4 shrink-0 transition-all font-medium"
                >
                  {maintenanceMode ? <Lock className="h-3.5 w-3.5 mr-1" /> : <Globe className="h-3.5 w-3.5 mr-1" />}
                  {maintenanceMode ? "Locked" : "Live"}
                </Button>
              </div>

              {/* Invite Only Registration Gate */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-background/50 border border-border/30">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Invite-Only Access Gate</p>
                  <p className="text-[11px] text-ink-muted pr-2">Prevent direct open registrations. Toggles public registrations to restrict enrollment strictly to invite links.</p>
                </div>
                <Button 
                  size="sm"
                  variant={inviteOnly ? "secondary" : "outline"}
                  onClick={() => toggleWorkflowConfig("invite")}
                  className="rounded-full h-9 px-4 shrink-0 transition-all font-medium"
                >
                  {inviteOnly ? "Enforced" : "Open"}
                </Button>
              </div>

              {/* AI Conversation Caps */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-background/50 border border-border/30">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Maya AI Speech Cap Limits</p>
                  <p className="text-[11px] text-ink-muted pr-2">Protects monthly server costs. Forces strict conversational caps and rate limits on standard voice captures.</p>
                </div>
                <Button 
                  size="sm"
                  variant={voiceLimitEnabled ? "secondary" : "outline"}
                  onClick={() => toggleWorkflowConfig("voice_limit")}
                  className="rounded-full h-9 px-4 shrink-0 transition-all font-medium"
                >
                  {voiceLimitEnabled ? "Limited" : "Unlimited"}
                </Button>
              </div>

              {/* CSV Importer */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-background/50 border border-border/30">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">CSV / Excel Spreadsheet Importer</p>
                  <p className="text-[11px] text-ink-muted pr-2">Turn on or off the Excel spreadsheet parsing system for bulk transaction uploads.</p>
                </div>
                <Button 
                  size="sm"
                  variant={excelImportEnabled ? "outline" : "secondary"}
                  onClick={() => toggleWorkflowConfig("excel_import")}
                  className="rounded-full h-9 px-4 shrink-0 transition-all font-medium"
                >
                  {excelImportEnabled ? "Enabled" : "Disabled"}
                </Button>
              </div>
            </div>

            {/* Global Broadcast Announcement System */}
            <div className="p-5 rounded-3xl border border-border/40 bg-card/30 space-y-4">
              <div className="flex items-center gap-3 border-b border-border/20 pb-3">
                <Globe className="h-5 w-5 text-indigo-500" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Global Announcement Broadcaster</h3>
                  <p className="text-[11px] text-ink-muted">Instantly broadcast rich push-style announcements to all active users' dashboards.</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-[10px] tracking-wider uppercase text-ink-muted mb-1 block">Announcement Title</Label>
                  <Input
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="System Upgrade Completed, Happy Tracking!..."
                    className="rounded-xl bg-background border-border/60 h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-[10px] tracking-wider uppercase text-ink-muted mb-1 block">Body Text / Description</Label>
                  <textarea
                    value={notifBody}
                    onChange={(e) => setNotifBody(e.target.value)}
                    placeholder="We have successfully upgraded the database. Your ledger is fully backed up. Direct voice parses are now 2x faster!"
                    rows={3}
                    className="w-full rounded-xl bg-background border border-border/60 p-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 text-foreground placeholder:text-ink-muted/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] tracking-wider uppercase text-ink-muted mb-1 block">Banner Type / Kind</Label>
                    <select
                      value={notifKind}
                      onChange={(e) => setNotifKind(e.target.value)}
                      className="w-full rounded-xl bg-background border border-border/60 h-9 px-3 text-xs text-foreground focus-visible:outline-none"
                    >
                      <option value="broadcast">Announcement (Neutral)</option>
                      <option value="alert">Alert (Action Needed)</option>
                      <option value="info">Information (Updates)</option>
                      <option value="success">Promo / Success</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-[10px] tracking-wider uppercase text-ink-muted mb-1 block">Optional Action URL/Link</Label>
                    <Input
                      value={notifLink}
                      onChange={(e) => setNotifLink(e.target.value)}
                      placeholder="/settings"
                      className="rounded-xl bg-background border-border/60 h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    disabled={busy || !notifTitle.trim() || !notifBody.trim()}
                    onClick={handleBroadcast}
                    className="rounded-full h-9 px-5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Send Broadcast
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Informational Notice */}
            <div className="p-4 rounded-3xl bg-surface/50 border border-border/30 flex items-start gap-3">
              <BadgeInfo className="h-4 w-4 text-ink-muted shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">System Gate Configuration Storage</p>
                <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">
                  These gates synchronize in local storage parameters across client instances on the current host. They are queried on page-bootstrap, creating immediate operational blocks without incurring additional database latency.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Audit Log (inline section) */}
        {activeTab === "users" && (
          <section className="mt-10 border-t border-border/25 pt-10">
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
        )}
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

      {/* Audit log full modal */}
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
  children, onClick, label, disabled, danger, className,
}: {
  children: React.ReactNode; onClick: () => void; label: string;
  disabled?: boolean; danger?: boolean; className?: string;
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
        className,
      )}
    >
      {children}
    </button>
  );
}
