import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryDef } from "@/lib/expenses";
import { useState } from "react";
import { CATEGORY_ICONS, CATEGORY_ICON_KEYS, CATEGORY_COLORS, getCategoryIcon } from "@/lib/categoryIcons";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, LogOut, Pencil, Plus, Trash2, X } from "lucide-react";
import { ThemeSettings } from "@/hooks/useTheme";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryDef[];
  onAddCategory: (name: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (name: string) => void;
  onSetCategoryStyle: (name: string, patch: { color?: string; icon?: string }) => void;
  onAddSubcategory: (category: string, sub: string) => void;
  onDeleteSubcategory: (category: string, sub: string) => void;
  onOpenBudgets: () => void;
  onOpenImport: () => void;
  onOpenSearch: () => void;
  profile: { email: string; name: string };
  onUpdateProfile: (patch: { name?: string; password?: string; currentPassword?: string }) => string | null;
  theme: ThemeSettings;
  onUpdateTheme: (patch: Partial<ThemeSettings>) => void;
  onLogout: () => void;
}

export default function Settings(props: Props) {
  const { open, onOpenChange } = props;
  const [section, setSection] = useState<"profile" | "categories" | "appearance" | "data">("profile");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-background border-border w-full sm:max-w-[560px] overflow-y-auto p-6"
      >
        <SheetHeader className="text-left mb-6">
          <SheetTitle className="font-serif text-3xl font-normal text-foreground">
            Settings
          </SheetTitle>
        </SheetHeader>

        <nav className="flex gap-1 bg-surface/60 rounded-full p-1 text-xs mb-8">
          {(["profile", "categories", "appearance", "data"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-full uppercase tracking-wider transition-colors capitalize",
                section === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-ink-muted hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </nav>

        {section === "profile" && <ProfileSection {...props} />}
        {section === "categories" && <CategoriesSection {...props} />}
        {section === "appearance" && <AppearanceSection {...props} />}
        {section === "data" && <DataSection {...props} />}

        <Button
          type="button"
          variant="ghost"
          onClick={() => { props.onLogout(); onOpenChange(false); }}
          className="mt-10 w-full rounded-full text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function ProfileSection({ profile, onUpdateProfile }: Props) {
  const [name, setName] = useState(profile.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const save = () => {
    const patch: any = {};
    if (name.trim() !== profile.name) patch.name = name.trim();
    if (newPassword) {
      patch.password = newPassword;
      patch.currentPassword = currentPassword;
    }
    if (Object.keys(patch).length === 0) {
      setMsg({ kind: "ok", text: "No changes." });
      return;
    }
    const err = onUpdateProfile(patch);
    if (err) setMsg({ kind: "err", text: err });
    else {
      setMsg({ kind: "ok", text: "Saved." });
      setCurrentPassword(""); setNewPassword("");
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
        <div className="relative">
          <Input type={show ? "text" : "password"} placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="rounded-full bg-background border-border text-foreground pr-10" />
        </div>
        <div className="relative">
          <Input type={show ? "text" : "password"} placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-full bg-background border-border text-foreground pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-foreground p-1" aria-label="Toggle password">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {msg && (
        <p className={cn("text-xs", msg.kind === "err" ? "text-destructive" : "text-ink-muted")}>
          {msg.text}
        </p>
      )}
      <Button type="button" onClick={save} className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-11">
        Save
      </Button>
    </div>
  );
}

function CategoriesSection({
  categories,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onSetCategoryStyle,
  onAddSubcategory,
  onDeleteSubcategory,
}: Props) {
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newSub, setNewSub] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          placeholder="New category"
          className="rounded-full bg-background border-border text-foreground"
        />
        <Button
          type="button"
          onClick={() => { const v = newCat.trim(); if (v) { onAddCategory(v); setNewCat(""); } }}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-4"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {categories.map((c) => {
        const Icon = getCategoryIcon(c.icon);
        const isEditing = editing === c.name;
        return (
          <div key={c.name} className="rounded-2xl border border-border/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span
                  className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: c.color || "hsl(var(--wash-sage))" }}
                >
                  <Icon className="h-4 w-4 text-foreground" />
                </span>
                {isEditing ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 rounded-full bg-background border-border text-sm"
                    autoFocus
                  />
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
                    <button onClick={() => { if (confirm(`Delete category "${c.name}"? Existing expenses keep this label.`)) onDeleteCategory(c.name); }} className="p-1.5 text-ink-muted hover:text-destructive rounded-full hover:bg-surface" aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted mb-2">Color</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => onSetCategoryStyle(c.name, { color: col })}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-transform",
                      c.color === col ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: col }}
                    aria-label={`Use color ${col}`}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted mb-2">Icon</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ICON_KEYS.map((key) => {
                  const I = CATEGORY_ICONS[key];
                  const active = c.icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSetCategoryStyle(c.name, { icon: key })}
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center transition-colors",
                        active ? "bg-foreground text-background" : "bg-surface text-ink-muted hover:text-foreground"
                      )}
                      aria-label={`Use icon ${key}`}
                    >
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
                <Input
                  value={newSub[c.name] || ""}
                  onChange={(e) => setNewSub((m) => ({ ...m, [c.name]: e.target.value }))}
                  placeholder="Add subcategory"
                  className="h-8 rounded-full bg-background border-border text-xs"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const v = (newSub[c.name] || "").trim();
                    if (!v) return;
                    onAddSubcategory(c.name, v);
                    setNewSub((m) => ({ ...m, [c.name]: "" }));
                  }}
                  className="rounded-full h-8 text-xs"
                >
                  Add
                </Button>
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
          {(["light", "dark"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onUpdateTheme({ mode: m })}
              className={cn(
                "flex-1 px-4 py-2 rounded-full text-sm border capitalize transition-colors",
                theme.mode === m
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-ink-muted hover:bg-surface"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium mb-3">Accent color</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdateTheme({ accent: c })}
              className={cn(
                "h-9 w-9 rounded-full border-2 transition-transform",
                theme.accent === c ? "border-foreground scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
              aria-label={`Accent ${c}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DataSection({ onOpenBudgets, onOpenImport, onOpenSearch, onOpenChange }: Props) {
  const item = (label: string, desc: string, onClick: () => void) => (
    <button
      onClick={() => { onClick(); onOpenChange(false); }}
      className="w-full text-left px-4 py-4 rounded-2xl bg-surface/50 hover:bg-surface transition-colors border border-border/40"
    >
      <p className="text-foreground text-sm">{label}</p>
      <p className="text-xs text-ink-muted mt-0.5">{desc}</p>
    </button>
  );
  return (
    <div className="space-y-3">
      {item("Manage transactions", "Search, edit, delete, export", onOpenSearch)}
      {item("Monthly budgets", "Set per-category limits", onOpenBudgets)}
      {item("Import data", "Upload CSV or Excel file", onOpenImport)}
    </div>
  );
}