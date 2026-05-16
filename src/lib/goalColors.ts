import { cn } from "@/lib/utils";

const GOAL_COLOR_CLASS: Record<string, string> = {
  primary: "bg-primary",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  indigo: "bg-indigo-500",
  sky: "bg-sky-500",
};

export function goalColorClass(color?: string) {
  return GOAL_COLOR_CLASS[color ?? "primary"] ?? GOAL_COLOR_CLASS.primary;
}

export function goalColorCn(color: string | undefined, extra?: string) {
  return cn(goalColorClass(color), extra);
}
