import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryDef, Expense } from "@/lib/expenses";
import { useRef, useState } from "react";
import { CATEGORY_ICONS, CATEGORY_ICON_KEYS, CATEGORY_COLORS, getCategoryIcon } from "@/lib/categoryIcons";
import { cn } from "@/lib/utils";
import { ArrowLeft, Eye, EyeOff, HandCoins, Loader2, LogOut, Pencil, Plus, RefreshCcw, Repeat, Trash2, X } from "lucide-react";
import { ThemeSettings, ACCENT_PALETTE } from "@/hooks/useTheme";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Profile } from "@/hooks/useAuth";
import type { Budgets } from "@/hooks/useExpenses";
import { validatePassword } from "@/lib/passwordPolicy";
import { toast } from "@/hooks/use-toast";
import { RollingDatePicker } from "@/components/RollingDatePicker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryDef[];
  onAddCategory: (name: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (name: string, strategy: "delete" | "move", target?: string) => void;
  onSetCategoryStyle: (name: string, patch: { color?: string; icon?: string }) => void;
  onAddSubcategory: (category: string, sub: string) => void;
  onDeleteSubcategory: (category: string, sub: string) => void;
  onOpenBudgets: () => void;
  onOpenImport: () => void;
  onOpenSearch: () => void;
  onOpenRecurring: () => void;
  onOpenLoans: () => void;
  onOpenTrash: () => void;
  profile: Profile;
  onUpdateProfile: (patch: { name?: string; password?: string }) => Promise<string | null>;
  theme: ThemeSettings;
  onUpdateTheme: (patch: Partial<ThemeSettings>) => void;
  onLogout: () => void;
  onSync: (opts?: { skipIfNoPending?: boolean; silentToast?: boolean }) => Promise<boolean>;
  syncing: boolean;
  lastSync: string | null;
  onExportData: () => { version: number; exported_at: string; expenses: Expense[]; categories: CategoryDef[]; budgets: Budgets };
  onRestoreData: (data: { expenses?: Expense[]; categories?: CategoryDef[]; budgets?: Budgets }, mode: "replace" | "merge") => Promise<void>;
  isAdmin: boolean;
}

export default function Settings(props: Props) {
  const { open, onOpenChange } = props;
  const [section, setSection] = useState<"profile" | "categories" | "appearance" | "data">("profile");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideCloseButton
        className="bg-background border-border w-full sm:max-w-[560px] p-0 flex flex-col h-full pt-[env(safe-area-inset-top,0px)]"
      >
        {/* Fixed Header & Navigation Container */}
        <div className="p-6 pb-4 border-b border-border/10 bg-background/90 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2 mb-5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full -ml-2 h-10 w-10"
              onClick={() => onOpenChange(false)}
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <SheetHeader className="text-left space-y-0 flex-1 p-0">
              <SheetTitle className="font-serif text-2xl sm:text-3xl font-normal text-foreground">Settings</SheetTitle>
            </SheetHeader>
          </div>

          <nav className="flex gap-1 bg-surface/60 rounded-full p-1 text-xs">
            {(["profile", "categories", "appearance", "data"] as const).map((s) => (
              <button
                key={s} onClick={() => setSection(s)}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-full uppercase tracking-wider transition-colors capitalize",
                  section === s ? "bg-background text-foreground shadow-sm" : "text-ink-muted hover:text-foreground"
                )}
              >{s}</button>
            ))}
          </nav>
        </div>

        {/* Scrollable Contents Container */}
        <div className="flex-1 overflow-y-auto p-6 pt-4 max-md:pb-[var(--finlo-mobile-tab-clearance)] md:pb-6 space-y-6 scrollbar-none">
          {section === "profile" && <ProfileSection {...props} />}
          {section === "categories" && <CategoriesSection {...props} />}
          {section === "appearance" && <AppearanceSection {...props} />}
          {section === "data" && <DataSection {...props} />}

          <Button
            type="button" variant="ghost"
            onClick={() => { props.onLogout(); onOpenChange(false); }}
            className="mt-6 w-full rounded-full text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>

          <div className="mt-8 pt-4 border-t border-border/10 text-center select-none pb-2">
            <p className="text-[9px] tracking-[0.25em] text-ink-muted/40 dark:text-ink-muted/30 font-bold uppercase">
              Finlo AI
            </p>
            <p className="text-[11px] text-ink-muted/60 dark:text-ink-muted/50 font-medium mt-1.5 tracking-tight font-sans">
              v1.0.12
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProfileSection({ profile, onUpdateProfile }: Props) {
  const [name, setName] = useState(profile.name);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const patch: { name?: string; password?: string } = {};
    if (name.trim() !== profile.name) patch.name = name.trim();
    if (newPassword) {
      const pwdErr = validatePassword(newPassword);
      if (pwdErr) {
        toast({ title: "Validation Error", description: pwdErr, variant: "destructive" });
        return;
      }
      if (newPassword !== confirmPassword) {
        toast({ title: "Validation Error", description: "Passwords do not match.", variant: "destructive" });
        return;
      }
      patch.password = newPassword;
    }
    if (Object.keys(patch).length === 0) {
      toast({ title: "No changes" });
      return;
    }
    setBusy(true);
    const err = await onUpdateProfile(patch);
    setBusy(false);
    if (err) toast({ title: "Error", description: err, variant: "destructive" });
    else {
      toast({ title: "Saved" });
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">Email</Label>
        <Input value={profile.email} disabled className="rounded-full bg-surface/40 border-border text-ink-muted" />
      </div>
      <div className="space-y-2">
        <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">Display name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-full bg-background border-border text-foreground" />
      </div>
      <div className="pt-2 border-t border-border/40 space-y-3">
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">Change password</p>
        <div className="space-y-2.5">
          <div className="relative">
            <Input type={show ? "text" : "password"} placeholder="New password (8+ chars: upper, lower, number, symbol)"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-full bg-background border-border text-foreground pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-foreground p-1" aria-label="Toggle password">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <Input type={showConfirm ? "text" : "password"} placeholder="Confirm new password"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-full bg-background border-border text-foreground pr-10" />
            <button type="button" onClick={() => setShowConfirm((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-foreground p-1" aria-label="Toggle confirm password">
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
      <Button type="button" onClick={save} disabled={busy}
        className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-11">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}

function CategoriesSection({
  categories, onAddCategory, onRenameCategory, onDeleteCategory,
  onSetCategoryStyle, onAddSubcategory, onDeleteSubcategory,
}: Props) {
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newSub, setNewSub] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteStrategy, setDeleteStrategy] = useState<"delete" | "move">("move");
  const [targetCat, setTargetCat] = useState("Misc");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={newCat} onChange={(e) => setNewCat(e.target.value)}
          placeholder="New category"
          className="rounded-full bg-background border-border text-foreground" />
        <Button type="button"
          onClick={() => { const v = newCat.trim(); if (v) { onAddCategory(v); setNewCat(""); } }}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-4">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {categories.map((c) => {
        const Icon = getCategoryIcon(c.icon);
        const isEditing = editing === c.name;
        return (
          <div key={c.name} className="rounded-2xl border border-border/40 p-4 space-y-3 bg-surface/30">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: c.color || "hsl(var(--wash-sage))" }}>
                  <Icon className="h-4 w-4 text-foreground" />
                </span>
                {isEditing ? (
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="h-8 rounded-full bg-background border-border text-sm" autoFocus />
                ) : (
                  <span className="text-foreground text-sm">{c.name}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => { onRenameCategory(c.name, editName); setEditing(null); }} className="h-7 text-xs">Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-7 text-xs">Cancel</Button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditing(c.name); setEditName(c.name); }} className="p-1.5 text-ink-muted hover:text-foreground rounded-full hover:bg-surface" aria-label="Rename">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(c.name)} className="p-1.5 text-ink-muted hover:text-destructive rounded-full hover:bg-surface" aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Deletion Dialog */}
            <AlertDialog open={confirmDelete === c.name} onOpenChange={(open) => !open && setConfirmDelete(null)}>
              <AlertDialogContent className="bg-background border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-serif text-2xl font-normal">Delete category?</AlertDialogTitle>
                  <AlertDialogDescription>
                    What should happen to the expenses in <span className="font-medium text-foreground">"{c.name}"</span>?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4 space-y-4">
                  <div className="flex gap-2">
                    {(["move", "delete"] as const).map((s) => (
                      <button key={s} onClick={() => setDeleteStrategy(s)}
                        className={cn("flex-1 px-3 py-2 rounded-full text-xs uppercase tracking-wider transition-colors border capitalize",
                          deleteStrategy === s ? "bg-foreground text-background border-foreground" : "border-border text-ink-muted")}>
                        {s === "move" ? "Move them" : "Delete them"}
                      </button>
                    ))}
                  </div>
                  {deleteStrategy === "move" && (
                    <div className="space-y-2">
                      <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Move to category</Label>
                      <div className="flex flex-wrap gap-2">
                        {categories.filter(x => x.name !== c.name).map(x => (
                          <button key={x.name} onClick={() => setTargetCat(x.name)}
                            className={cn("px-3 py-1.5 rounded-full text-xs border transition-colors",
                              targetCat === x.name ? "bg-wash-sage border-wash-sage text-foreground" : "border-border text-ink-muted")}>
                            {x.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    onDeleteCategory(c.name, deleteStrategy, deleteStrategy === "move" ? targetCat : undefined);
                    setConfirmDelete(null);
                  }} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete Category
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted mb-2">Color</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((col) => (
                  <button key={col} type="button"
                    onClick={() => onSetCategoryStyle(c.name, { color: col })}
                    className={cn("h-7 w-7 rounded-full border-2 transition-transform",
                      c.color === col ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: col }} aria-label={`Use color ${col}`} />
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted mb-2">Icon</p>
              <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1 pb-1 border border-border/20 rounded-xl p-2 bg-background/50 custom-scrollbar">
                {CATEGORY_ICON_KEYS.map((key) => {
                  const I = CATEGORY_ICONS[key];
                  const active = c.icon === key;
                  return (
                    <button key={key} type="button"
                      onClick={() => onSetCategoryStyle(c.name, { icon: key })}
                      className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                        active ? "bg-foreground text-background scale-90 shadow-sm" : "bg-surface/50 text-ink-muted hover:text-foreground hover:bg-surface")}
                      aria-label={`Use icon ${key}`}>
                      <I className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted mb-2">Subcategories</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {c.subcategories.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-surface text-foreground capitalize">
                    {s}
                    <button onClick={() => onDeleteSubcategory(c.name, s)} aria-label={`Remove ${s}`} className="text-ink-muted hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={newSub[c.name] || ""}
                  onChange={(e) => setNewSub((m) => ({ ...m, [c.name]: e.target.value }))}
                  placeholder="Add subcategory"
                  className="h-8 rounded-full bg-background border-border text-xs" />
                <Button size="sm" variant="secondary"
                  onClick={() => {
                    const v = (newSub[c.name] || "").trim();
                    if (!v) return;
                    onAddSubcategory(c.name, v);
                    setNewSub((m) => ({ ...m, [c.name]: "" }));
                  }}
                  className="rounded-full h-8 text-xs">Add</Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AppearanceSection({ theme, onUpdateTheme }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium mb-3">Mode</p>
        <div className="flex gap-2">
          {(["light", "dark", "system"] as const).map((m) => (
            <button key={m} onClick={() => onUpdateTheme({ mode: m })}
              className={cn(
                "flex-1 px-4 py-2 rounded-full text-sm border capitalize transition-colors",
                theme.mode === m ? "bg-foreground text-background border-foreground" : "border-border text-ink-muted hover:bg-surface"
              )}>{m}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium mb-3">Accent color</p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PALETTE.map((c) => (
            <button key={c} onClick={() => onUpdateTheme({ accent: c })}
              className={cn(
                "h-10 w-10 rounded-full border-2 transition-transform",
                theme.accent === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
              )}
              style={{ backgroundColor: c }} aria-label={`Accent ${c}`} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium mb-3">Currency</p>
        <div className="flex flex-wrap gap-2">
          {[
            { code: "INR", symbol: "₹" },
            { code: "USD", symbol: "$" },
            { code: "EUR", symbol: "€" },
            { code: "GBP", symbol: "£" }
          ].map((c) => (
            <button key={c.code} onClick={() => onUpdateTheme({ currency: c.code, currencySymbol: c.symbol })}
              className={cn(
                "px-4 py-2 rounded-full text-sm border transition-colors",
                theme.currency === c.code ? "bg-foreground text-background border-foreground" : "border-border text-ink-muted hover:bg-surface"
              )}>
              {c.symbol} {c.code}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataSection({
  onOpenBudgets, onOpenImport, onOpenSearch, onOpenRecurring, onOpenLoans, onOpenTrash, onOpenChange,
  onSync, syncing, lastSync, onExportData, onRestoreData, profile,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoring, setRestoring] = useState(false);
  const [exportFrom, setExportFrom] = useState<string>("");
  const [exportTo, setExportTo] = useState<string>("");

  const item = (label: string, desc: string, onClick: () => void, icon?: React.ReactNode) => (
    <button onClick={onClick}
      className="w-full text-left px-4 py-4 rounded-2xl bg-surface/50 hover:bg-surface transition-colors border border-border/40 flex items-center gap-3">
      {icon && <div className="text-foreground">{icon}</div>}
      <div className="flex-1">
        <p className="text-foreground text-sm">{label}</p>
        <p className="text-xs text-ink-muted mt-0.5">{desc}</p>
      </div>
    </button>
  );

  const handleExportJSON = () => {
    const data = onExportData();
    const username = (profile.name || profile.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let filtered = data.expenses;
    if (exportFrom) filtered = filtered.filter((e) => e.date >= exportFrom);
    if (exportTo) filtered = filtered.filter((e) => e.date <= exportTo);
    const payload = { ...data, expenses: filtered, range: { from: exportFrom || null, to: exportTo || null } };
    let suffix: string;
    if (exportFrom && exportTo) {
      suffix = exportFrom === exportTo ? exportFrom
        : (exportFrom.slice(0, 7) === exportTo.slice(0, 7) && exportFrom.endsWith("-01"))
          ? exportFrom.slice(0, 7) : `${exportFrom}_to_${exportTo}`;
    } else {
      suffix = new Date().toISOString().slice(0, 10);
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `finlo-${username}-${suffix}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Backup downloaded", description: `${filtered.length} expense(s)` });
  };

  const handleRestoreFile = async (f: File) => {
    setRestoring(true);
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      if (!json || typeof json !== "object") throw new Error("Invalid file");
      await onRestoreData({
        expenses: Array.isArray(json.expenses) ? json.expenses : undefined,
        categories: Array.isArray(json.categories) ? json.categories : undefined,
        budgets: json.budgets && typeof json.budgets === "object" ? json.budgets : undefined,
      }, restoreMode);
      toast({ title: "Restore complete", description: `Mode: ${restoreMode}` });
    } catch (e) {
      toast({ title: "Restore failed", description: String(e), variant: "destructive" });
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="px-4 py-3 rounded-2xl border border-border/40 bg-surface/30 flex items-center gap-3">
        <RefreshCcw className={cn("h-4 w-4 text-foreground", syncing && "animate-spin")} />
        <div className="flex-1">
          <p className="text-foreground text-sm">Sync</p>
          <p className="text-[11px] text-ink-muted mt-0.5">
            {lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : "Never synced yet"}
          </p>
        </div>
        <Button size="sm" onClick={() => void onSync()} disabled={syncing}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90 h-8">
          Sync now
        </Button>
      </div>

      {item("Manage transactions", "Search, edit, delete, export", () => { onOpenSearch(); onOpenChange(false); })}
      {item("Monthly budgets", "Set per-category limits & alerts", () => { onOpenBudgets(); onOpenChange(false); })}
      {item("Recurring expenses", "Auto-create monthly bills", () => { onOpenRecurring(); onOpenChange(false); }, <Repeat className="h-4 w-4" />)}
      {item("Lending", "Track money you've lent or borrowed", () => { onOpenLoans(); onOpenChange(false); }, <HandCoins className="h-4 w-4" />)}
      {item("Trash bin", "Restore soft-deleted items within 30 days", () => { onOpenTrash(); onOpenChange(false); }, <Trash2 className="h-4 w-4 text-destructive/80" />)}
      {item("Import CSV / Excel", "Upload spreadsheet of expenses", () => { onOpenImport(); onOpenChange(false); })}

      <div className="pt-4 mt-4 border-t border-border/40 space-y-3">
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">Backup</p>
        <div className="px-4 py-4 rounded-2xl border border-border/40 bg-surface/30 space-y-3">
          <p className="text-foreground text-sm">Export JSON</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">From</Label>
              <RollingDatePicker value={exportFrom} onChange={(val) => setExportFrom(val)} placeholder="Start date" />
            </div>
            <div>
              <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">To</Label>
              <RollingDatePicker value={exportTo} onChange={(val) => setExportTo(val)} placeholder="End date" />
            </div>
          </div>
          <p className="text-[11px] text-ink-muted">Leave both blank to export everything.</p>
          <Button size="sm" onClick={handleExportJSON}
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-9">
            Download JSON backup
          </Button>
        </div>

        <div className="px-4 py-4 rounded-2xl border border-border/40 bg-surface/30 space-y-3">
          <p className="text-foreground text-sm">Restore from JSON</p>
          <div className="flex gap-2">
            {(["merge", "replace"] as const).map((m) => (
              <button key={m} onClick={() => setRestoreMode(m)}
                className={cn("flex-1 px-3 py-1.5 rounded-full text-xs uppercase tracking-wider transition-colors capitalize border",
                  restoreMode === m ? "bg-foreground text-background border-foreground" : "border-border text-ink-muted")}>
                {m}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-muted">
            {restoreMode === "merge" ? "Adds new entries; keeps existing." : "Wipes everything and replaces with backup."}
          </p>
          <input
            ref={fileRef} type="file" accept="application/json,.json"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRestoreFile(f); }}
            className="hidden" />
          <Button size="sm" disabled={restoring}
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-9">
            {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : "Choose JSON file"}
          </Button>
        </div>
      </div>
    </div>
  );
}
