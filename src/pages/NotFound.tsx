import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md rounded-[28px] border border-border/50 bg-card/50 px-8 py-10 text-center backdrop-blur-sm shadow-[var(--shadow-md)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ink-muted">Finlo</p>
        <h1 className="mt-3 font-serif text-5xl font-light tabular-nums">404</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          This path doesn&apos;t exist. Try the home ledger instead.
        </p>
        <Button asChild className="mt-8 rounded-full bg-foreground text-background hover:bg-foreground/90">
          <Link to="/">Back to Finlo</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
