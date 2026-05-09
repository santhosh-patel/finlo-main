import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type FromState = { from?: { pathname: string; search?: string } };

function destinationAfterAuth(state: unknown): string {
  const s = state as FromState | null;
  const path = s?.from?.pathname;
  if (!path) return "/";
  const q = s.from.search ?? "";
  return `${path}${q}`;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const afterAuth = useMemo(() => destinationAfterAuth(location.state), [location.state]);
  const { login, isAuthed, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthed) navigate(afterAuth, { replace: true });
  }, [loading, isAuthed, navigate, afterAuth]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setError("Email is required.");
    if (!password) return setError("Password is required.");
    setSubmitting(true);
    setError(null);

    const err = await login(email, password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    navigate(afterAuth, { replace: true });
  };

  return (
    <main className="min-h-dvh bg-background text-foreground font-sans flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <img
            src="/finlo-logo.png"
            alt="Finlo"
            width={56}
            height={56}
            className="mx-auto mb-4 h-14 w-14 rounded-2xl shadow-sm"
            decoding="async"
          />
          <h1 className="font-serif text-4xl text-foreground">Finlo</h1>
          <p className="text-xs text-ink-muted mt-2 tracking-wider uppercase">
            Sign in to continue
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-5 rounded-3xl border border-border/45 bg-surface/60 p-6 shadow-sm backdrop-blur-sm dark:bg-card/45 dark:border-border/55 dark:shadow-[var(--shadow-md)]"
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
              Email
            </Label>
            <Input
              id="email" type="email" autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              className="rounded-full bg-background border-border text-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                className="rounded-full bg-background border-border text-foreground pr-10"
              />
              <button
                type="button" onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-foreground p-1"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive text-center leading-relaxed" role="alert">{error}</p>
          )}

          <Button
            type="submit" size="lg" disabled={submitting || loading}
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-12 text-base font-medium"
          >
            {submitting || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>

        <p className="text-[11px] text-ink-muted text-center mt-6">
          Synced across devices · Offline-ready
        </p>
      </div>
    </main>
  );
}
