import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  online: boolean;
  className?: string;
};

export function OfflineBanner({ online, className }: Props) {
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2.5 text-center text-xs font-medium",
        "bg-destructive/15 text-destructive border-b border-destructive/25",
        className,
      )}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      You are offline. Changes may not sync until you reconnect.
    </div>
  );
}
