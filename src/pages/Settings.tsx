import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UpdateAvailableCard } from "@/components/UpdateAvailableCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryDef, Expense, expensesToCSV, downloadCSV } from "@/lib/expenses";
import { useRef, useState, useCallback, useEffect } from "react";
import { CATEGORY_ICONS, CATEGORY_ICON_KEYS, CATEGORY_COLORS, getCategoryIcon } from "@/lib/categoryIcons";
import { cn, vibrate } from "@/lib/utils";
import { ArrowLeft, Eye, EyeOff, HandCoins, Loader2, LogOut, Pencil, Plus, RefreshCcw, Repeat, Trash2, X } from "lucide-react";
import { ThemeSettings, ACCENT_PALETTE } from "@/hooks/useTheme";
import { Users, Heart, Share2, Mail, CheckCircle2, Clock, Bell, BellOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  onOpenSubscriptions: () => void;
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
  /** Offline or failed writes still queued for Supabase */
  pendingCount: number;
  onExportData: () => { version: number; exported_at: string; expenses: Expense[]; categories: CategoryDef[]; budgets: Budgets };
  onRestoreData: (data: { expenses?: Expense[]; categories?: CategoryDef[]; budgets?: Budgets }, mode: "replace" | "merge") => Promise<void>;
  isAdmin: boolean;
}

export default function Settings(props: Props) {
  const { open, onOpenChange } = props;
  const [section, setSection] = useState<"profile" | "household" | "categories" | "appearance" | "data">("profile");

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

          <nav className="relative flex gap-1 bg-surface/60 rounded-full p-1 text-xs overflow-x-auto scrollbar-none snap-x">
            {(["profile", "household", "categories", "appearance", "data"] as const).map((s) => (
              <button
                key={s} onClick={() => { vibrate(10); setSection(s); }}
                className={cn(
                  "relative z-10 flex-1 whitespace-nowrap px-4 py-2 sm:py-1.5 rounded-full uppercase tracking-wider transition-all duration-200 capitalize snap-center outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                  section === s ? "text-foreground font-semibold bg-background shadow-sm" : "text-ink-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >{s}</button>
            ))}
          </nav>
        </div>

        {/* Scrollable Contents Container */}
        <div className="flex-1 overflow-y-auto p-6 pt-4 max-md:pb-[var(--finlo-mobile-tab-clearance)] md:pb-6 space-y-6 scrollbar-none">
          <UpdateAvailableCard />
          {section === "profile" && <ProfileSection {...props} />}
          {section === "household" && <HouseholdSection profile={props.profile} onSync={props.onSync} />}
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
              v1.2.0
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
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const toggleNotifications = async () => {
    if (typeof Notification === "undefined") {
      toast({ title: "Not supported", description: "Your browser doesn't support notifications.", variant: "destructive" });
      return;
    }

    if (Notification.permission === "denied") {
      toast({ title: "Permission Denied", description: "Please enable notifications in your browser settings.", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      if (isSubscribed) {
        // Unsubscribe
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await (supabase as any).from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
        setIsSubscribed(false);
        toast({ title: "Notifications disabled" });
      } else {
        // Subscribe
        const permission = await Notification.requestPermission();
        setNotificationStatus(permission);
        if (permission !== "granted") throw new Error("Permission not granted");

        const reg = await navigator.serviceWorker.ready;
        // Public key for development/demo. User should replace this with their own VAPID key.
        const vapidPublicKey = "BPY58mE69GzO6yR9S2qD8G5N3C1F4B7V9W3Q5P8M2L0K1J4H7G9F8D5S3A1Q";

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey
        });

        // Convert key buffers to base64
        const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey("p256dh")!) as any));
        const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey("auth")!) as any));

        const { error } = await (supabase as any).from("push_subscriptions").insert({
          user_id: profile.user_id,
          endpoint: sub.endpoint,
          p256dh,
          auth
        } as any);

        if (error) throw error;
        setIsSubscribed(true);
        toast({ title: "Notifications enabled!", description: "You'll now receive alerts for shared expenses." });
      }
    } catch (err: any) {
      console.error("Subscription error:", err);
      toast({ title: "Subscription failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

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
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Profile"}
      </Button>

      {/* Notifications Toggle */}
      <div className="space-y-3 pt-4 border-t border-border/10">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-surface/30 border border-border/20">
          <div className="flex gap-3 items-center">
            <div className={cn(
              "h-10 w-10 rounded-2xl flex items-center justify-center transition-colors",
              isSubscribed ? "bg-primary/10 text-primary" : "bg-ink-muted/10 text-ink-muted"
            )}>
              {isSubscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Push Notifications</p>
              <p className="text-[11px] text-ink-muted/60">{isSubscribed ? "Enabled on this device" : "Receive alerts for shared expenses"}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={toggleNotifications}
            className="relative h-6 w-11 rounded-full transition-colors duration-300 disabled:opacity-50"
            style={{ backgroundColor: isSubscribed ? "hsl(var(--foreground))" : "hsl(var(--border) / 0.8)" }}
            role="switch"
            aria-checked={isSubscribed}
          >
            <div className={cn(
              "absolute top-[4px] left-[4px] h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-300 ease-out-soft",
              isSubscribed && "translate-x-5",
            )} />
          </button>
        </div>
        {notificationStatus === "denied" && (
          <p className="text-[10px] text-destructive px-2 italic">Notifications are blocked in your browser settings. Please enable them to receive alerts.</p>
        )}
      </div>
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

function supabaseHostFromEnv(): string {
  const raw = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!raw?.trim()) return "(not set in this build)";
  try {
    return new URL(raw.trim()).host;
  } catch {
    return "(invalid VITE_SUPABASE_URL)";
  }
}

function DataSection({
  onOpenBudgets, onOpenImport, onOpenSearch, onOpenRecurring, onOpenSubscriptions, onOpenLoans, onOpenTrash, onOpenChange,
  onSync, syncing, lastSync, pendingCount, onExportData, onRestoreData, profile,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoring, setRestoring] = useState(false);
  const [exportFrom, setExportFrom] = useState<string>("");
  const [exportTo, setExportTo] = useState<string>("");
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");

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

  const handleExportData = () => {
    const data = onExportData();
    const username = (profile.name || profile.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let filtered = data.expenses;
    if (exportFrom) filtered = filtered.filter((e) => e.date.split("T")[0] >= exportFrom);
    if (exportTo) filtered = filtered.filter((e) => e.date.split("T")[0] <= exportTo);

    let suffix: string;
    if (exportFrom && exportTo) {
      suffix = exportFrom === exportTo ? exportFrom
        : (exportFrom.slice(0, 7) === exportTo.slice(0, 7) && exportFrom.endsWith("-01"))
          ? exportFrom.slice(0, 7) : `${exportFrom}_to_${exportTo}`;
    } else {
      suffix = new Date().toISOString().slice(0, 10);
    }

    if (exportFormat === "json") {
      const payload = { ...data, expenses: filtered, range: { from: exportFrom || null, to: exportTo || null } };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `finlo-${username}-${suffix}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const csv = expensesToCSV(filtered);
      downloadCSV(`finlo-${username}-${suffix}.csv`, csv);
    }

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
            {pendingCount > 0 && (
              <span className="block mt-1 text-amber-600 dark:text-amber-400 font-medium">
                {pendingCount} change{pendingCount === 1 ? "" : "s"} waiting to sync — stay online and tap Sync now.
              </span>
            )}
          </p>
          <p className="text-[10px] text-ink-muted/80 mt-2 font-mono leading-relaxed break-all">
            This app build → <span className="text-foreground/80">{supabaseHostFromEnv()}</span>
            <br />
            Signed-in user id → <span className="text-foreground/80">{profile.user_id || "—"}</span>
          </p>
          <p className="text-[10px] text-ink-muted/70 mt-1.5 leading-snug">
            Your ledger lives in Supabase, not in this browser. Every install (localhost, prod, mobile) must show the same host and the same user id to share one ledger. Redeploy after changing env vars so the new URL is baked into the build.
          </p>
        </div>
        <Button size="sm" onClick={() => void onSync()} disabled={syncing}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90 h-8">
          Sync now
        </Button>
      </div>

      {item("Manage transactions", "Search, edit, delete, export", () => { onOpenSearch(); onOpenChange(false); })}
      {item("Monthly budgets", "Set per-category limits & alerts", () => { onOpenBudgets(); onOpenChange(false); })}
      {item("Subscriptions", "Manage recurring bills & alerts", () => { onOpenSubscriptions(); onOpenChange(false); }, <Repeat className="h-4 w-4" />)}
      {item("Recurring expenses", "Auto-create monthly bills", () => { onOpenRecurring(); onOpenChange(false); }, <RefreshCcw className="h-4 w-4" />)}
      {item("Lending", "Track money you've lent or borrowed", () => { onOpenLoans(); onOpenChange(false); }, <HandCoins className="h-4 w-4" />)}
      {item("Trash bin", "Restore soft-deleted items within 7 days", () => { onOpenTrash(); onOpenChange(false); }, <Trash2 className="h-4 w-4 text-destructive/80" />)}
      {item("Import CSV / Excel", "Upload spreadsheet of expenses", () => { onOpenImport(); onOpenChange(false); })}

      <div className="pt-4 mt-4 border-t border-border/40 space-y-3">
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">Backup</p>
        <div className="px-4 py-4 rounded-2xl border border-border/40 bg-surface/30 space-y-3">
          <p className="text-foreground text-sm">Export Data</p>

          <div className="space-y-2">
            <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Format</Label>
            <div className="flex bg-background border border-border/40 rounded-full p-0.5">
              {(["json", "csv"] as const).map((format) => (
                <button
                  type="button"
                  key={format}
                  onClick={() => { vibrate(10); setExportFormat(format); }}
                  className={cn(
                    "flex-1 py-1.5 rounded-full text-xs uppercase tracking-wider transition-all font-medium",
                    exportFormat === format
                      ? "bg-foreground text-background shadow-sm font-semibold"
                      : "text-ink-muted hover:text-foreground"
                  )}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

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
          <Button size="sm" onClick={handleExportData}
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-9 capitalize">
            Download {exportFormat} backup
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

function HouseholdSection({ profile, onSync }: { profile: Profile; onSync: () => Promise<boolean> }) {
  const [household, setHousehold] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [incomingInvite, setIncomingInvite] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadHousehold = useCallback(async () => {
    setLoading(true);

    // If the user has a household, load it and find partner
    if (profile.household_id) {
      const { data: hh } = await supabase
        .from("households")
        .select("*")
        .eq("id", profile.household_id)
        .single();

      if (hh) {
        setHousehold(hh);
        const { data: members } = await supabase
          .from("profiles")
          .select("display_name, email, user_id")
          .eq("household_id", hh.id)
          .neq("user_id", profile.user_id);
        setPartner(members?.[0] ?? null);
      }

      // Also load outgoing invites the user has sent
      const { data: invs } = await supabase
        .from("household_invites")
        .select("*")
        .eq("inviter_id", profile.user_id)
        .eq("status", "pending");
      setInvites(invs || []);
    } else {
      // No household — check if someone invited this user
      const { data: incoming } = await supabase
        .from("household_invites")
        .select("id, household_id, email, inviter_id, profiles:inviter_id(display_name)")
        .eq("email", profile.email.toLowerCase())
        .eq("status", "pending")
        .maybeSingle();
      setIncomingInvite(incoming ?? null);
    }

    setLoading(false);
  }, [profile.household_id, profile.user_id, profile.email]);

  useEffect(() => { loadHousehold(); }, [loadHousehold]);

  const acceptInvite = async () => {
    if (!incomingInvite) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("respond-to-invite", {
        body: { invite_id: incomingInvite.id, action: "accept" }
      });

      if (error || data?.error) throw error || new Error(data.error);

      await onSync();
      toast({ title: "Joined household!", description: "You and your partner are now connected." });
      setIncomingInvite(null);
    } catch (err: any) {
      console.error("Accept error:", err);
      toast({ title: "Failed to join", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const rejectInvite = async () => {
    if (!incomingInvite) return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("respond-to-invite", {
        body: { invite_id: incomingInvite.id, action: "reject" }
      });
      if (error) throw error;
      setIncomingInvite(null);
      toast({ title: "Invite declined" });
    } catch (err: any) {
      toast({ title: "Error", description: "Could not decline invite", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const createHousehold = async () => {
    setBusy(true);
    try {
      const householdName = `${profile.name}'s Household`;
      const { data: hh, error } = await supabase
        .from("households")
        .insert({ name: householdName })
        .select()
        .single();
      if (error) throw error;

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ household_id: hh.id })
        .eq("user_id", profile.user_id);
      if (profileErr) throw profileErr;

      await onSync();
      toast({ title: "Household created", description: "Invite your partner to get started." });
      window.location.reload();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const invitePartner = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    // Prevent inviting yourself
    if (trimmedEmail === profile.email.toLowerCase()) {
      toast({ title: "Invalid email", description: "You can't invite yourself.", variant: "destructive" });
      return;
    }

    // Prevent duplicate invites
    if (invites.some((inv) => inv.email === trimmedEmail)) {
      toast({ title: "Already invited", description: `${trimmedEmail} already has a pending invite.` });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase
        .from("household_invites")
        .insert({
          household_id: profile.household_id!,
          inviter_id: profile.user_id,
          email: trimmedEmail,
        });
      if (error) throw error;

      toast({ title: "Invite sent", description: `${trimmedEmail} will see it when they open the Household tab.` });
      setEmail("");
      await loadHousehold();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    try {
      await supabase.from("household_invites").update({ status: "cancelled" }).eq("id", inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast({ title: "Invite cancelled" });
    } catch {
      toast({ title: "Failed to cancel invite", variant: "destructive" });
    }
  };

  const leaveHousehold = async () => {
    if (!window.confirm("Are you sure you want to leave the household? You will lose access to shared expenses and budgets.")) return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("leave-household");
      if (error) throw error;
      await onSync();
      toast({ title: "Left household", description: "You are now managing finances individually." });
    } catch (err: any) {
      toast({ title: "Error", description: "Could not leave household", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-pulse">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
        <p className="text-sm text-ink-muted">Loading household...</p>
      </div>
    );
  }

  // === No household yet ===
  if (!profile.household_id) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
        {/* Incoming Invitation UI */}
        {incomingInvite && (
          <div className="relative overflow-hidden p-6 rounded-[2rem] bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-primary/20 shadow-xl shadow-primary/5">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Heart className="h-24 w-24 fill-primary" />
            </div>

            <div className="relative flex flex-col items-center text-center space-y-5">
              <div className="h-16 w-16 rounded-3xl bg-primary/20 flex items-center justify-center shadow-inner">
                <Heart className="h-8 w-8 text-primary fill-primary animate-pulse" />
              </div>

              <div className="space-y-1.5">
                <h3 className="font-serif text-2xl tracking-tight text-foreground">You're invited</h3>
                <p className="text-sm text-ink-muted px-6 leading-relaxed">
                  <span className="font-semibold text-foreground">
                    {incomingInvite.profiles?.display_name || "A partner"}
                  </span>{" "}
                  is asking to manage finances together with you.
                </p>
              </div>

              <div className="flex gap-3 w-full pt-2">
                <Button
                  onClick={acceptInvite}
                  className="flex-1 rounded-2xl h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 font-medium"
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin h-4 w-4" /> : "Accept & Join"}
                </Button>
                <Button
                  onClick={rejectInvite}
                  variant="outline"
                  className="flex-1 rounded-2xl h-12 border-primary/20 hover:bg-primary/5 text-primary"
                  disabled={busy}
                >
                  Decline
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Start Household CTA */}
        <div className="flex flex-col items-center text-center space-y-6 py-8">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
            <div className="relative w-20 h-20 rounded-[2.5rem] bg-surface border border-border/40 flex items-center justify-center shadow-2xl rotate-3">
              <Users className="h-10 w-10 text-foreground/80" />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-serif text-2xl tracking-tight">Financial Intimacy</h3>
            <p className="text-sm text-ink-muted leading-relaxed max-w-[280px]">
              Combine your spending power. Create a shared space to manage bills, budgets, and long-term goals together.
            </p>
          </div>

          <div className="w-full max-w-[260px] space-y-3">
            <Button
              onClick={createHousehold}
              disabled={busy}
              className="w-full rounded-2xl bg-foreground text-background hover:bg-foreground/90 h-12 shadow-xl shadow-foreground/5 font-medium"
            >
              {busy ? <Loader2 className="animate-spin h-5 w-5" /> : "Start Shared Space"}
            </Button>
            <p className="text-[10px] text-ink-muted/60 uppercase tracking-[0.2em] font-bold">
              Secure · Private · Shared
            </p>
          </div>
        </div>
      </div>
    );
  }

  // === Has household ===
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Household Header Card */}
      <div className="relative overflow-hidden p-6 rounded-[2.5rem] bg-surface/40 border border-border/40 backdrop-blur-sm shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-3xl bg-foreground text-background flex items-center justify-center shadow-xl rotate-[-2deg]">
              <Heart className="h-7 w-7 fill-current" />
            </div>
            <div>
              <h4 className="text-xl font-serif text-foreground leading-none">{household?.name || "Shared Space"}</h4>
              <div className="flex items-center gap-2 mt-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <p className="text-[10px] text-ink-muted uppercase tracking-[0.15em] font-bold">Connected &amp; Synced</p>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={leaveHousehold}
            className="text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-full h-8 px-3 text-[11px] font-bold uppercase tracking-wider"
          >
            Leave
          </Button>
        </div>

        {/* Member Avatars Overlap */}
        <div className="mt-8 flex items-center justify-between">
          <div className="flex -space-x-3">
            <div className="h-12 w-12 rounded-2xl bg-foreground text-background flex items-center justify-center text-lg font-bold border-4 border-surface shadow-md">
              {(profile.display_name?.[0] || profile.email?.[0] || "U").toUpperCase()}
            </div>
            {partner ? (
              <div className="h-12 w-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center text-lg font-bold border-4 border-surface shadow-md ring-1 ring-primary/20">
                {(partner.display_name?.[0] || partner.email?.[0] || "P").toUpperCase()}
              </div>
            ) : (
              <div className="h-12 w-12 rounded-2xl bg-surface-dark border-4 border-surface flex items-center justify-center border-dashed text-ink-muted">
                <Users className="h-5 w-5 opacity-40" />
              </div>
            )}
          </div>

          <div className="text-right">
            <p className="text-xs font-medium text-foreground">
              {partner ? (partner.display_name || partner.email.split('@')[0]) : "Individual Mode"}
            </p>
            <p className="text-[10px] text-ink-muted">{partner ? "Partner joined" : "Waiting for partner"}</p>
          </div>
        </div>

        {/* Invite Flow inside the card */}
        {!partner && (
          <div className="mt-8 pt-6 border-t border-border/20 space-y-4">
            <div className="space-y-1.5">
              <h5 className="text-sm font-medium text-foreground">Invite your partner</h5>
              <p className="text-xs text-ink-muted leading-relaxed">Send an invitation to their email to start managing together.</p>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted group-focus-within:text-foreground transition-colors" />
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") invitePartner(); }}
                  placeholder="Partner's email"
                  type="email"
                  className="rounded-2xl bg-surface-dark/50 border-transparent focus:border-border pl-10 h-11 text-sm shadow-inner"
                />
              </div>
              <Button
                onClick={invitePartner}
                disabled={busy || !email.trim()}
                className="rounded-2xl w-11 h-11 p-0 shrink-0 shadow-lg shadow-foreground/5"
              >
                {busy ? <Loader2 className="animate-spin h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              </Button>
            </div>

            {/* Outgoing pending invites */}
            {invites.length > 0 && (
              <div className="space-y-2 pt-2">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 p-3 rounded-2xl bg-surface/60 border border-border/20 animate-in fade-in slide-in-from-top-1">
                    <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate text-foreground">{inv.email}</p>
                      <p className="text-[10px] text-ink-muted uppercase tracking-tight">Pending invitation</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => cancelInvite(inv.id)}
                      className="h-8 w-8 rounded-full text-ink-muted hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shared Features Summary */}
      <div className="grid grid-cols-1 gap-3">
        {[
          {
            title: "Joint Dashboard",
            desc: "Both see all logged transactions in real-time.",
            icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          },
          {
            title: "Combined Budgets",
            desc: "Monthly limits apply to your shared total spending.",
            icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          },
          {
            title: "Privacy & Control",
            desc: "Log private transactions when needed.",
            icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          }
        ].map((feat, i) => (
          <div key={i} className="flex items-start gap-4 p-4 rounded-3xl border border-border/10 bg-surface/10 backdrop-blur-[2px]">
            <div className="mt-0.5">{feat.icon}</div>
            <div className="space-y-0.5">
              <h5 className="text-sm font-semibold text-foreground">{feat.title}</h5>
              <p className="text-[11px] text-ink-muted leading-relaxed">{feat.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
