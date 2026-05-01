import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  onLogin: (email: string, password: string) => string | null;
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setError("Email is required.");
    if (!password) return setError("Password is required.");
    const err = onLogin(email, password);
    setError(err);
  };

  return (
    <main className="min-h-dvh bg-background text-foreground font-sans flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="font-serif text-4xl text-foreground">Ledger</h1>
          <p className="text-xs text-ink-muted mt-2 tracking-wider uppercase">
            Sign in to continue
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5 bg-surface/60 border border-border/40 rounded-3xl p-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              className="rounded-full bg-background border-border text-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              className="rounded-full bg-background border-border text-foreground"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">{error}</p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-12 text-base font-medium"
          >
            Sign in
          </Button>
        </form>

        <p className="text-[11px] text-ink-muted text-center mt-6">
          Personal account · expenses stay on this device
        </p>
      </div>
    </main>
  );
}