import {
  Utensils,
  ShoppingBasket,
  ShoppingBag,
  Car,
  Plug,
  Home,
  Wallet,
  Heart,
  Film,
  Plane,
  Coffee,
  Gift,
  Book,
  Smartphone,
  Dumbbell,
  Baby,
  Briefcase,
  PiggyBank,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { DEFAULT_CATEGORIES } from "@/lib/expenses";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Utensils,
  ShoppingBasket,
  ShoppingBag,
  Car,
  Plug,
  Home,
  Wallet,
  Heart,
  Film,
  Plane,
  Coffee,
  Gift,
  Book,
  Smartphone,
  Dumbbell,
  Baby,
  Briefcase,
  PiggyBank,
  Tag,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

export const CATEGORY_COLORS = [
  "#E3D3C2", "#D1D8CA", "#C8D6E5", "#F1D6B7", "#E8C9D6",
  "#D6CFE8", "#E0DDD5", "#F4C2C2", "#B8D8BA", "#D6E5F4",
  "#FFD6A5", "#FDFFB6", "#CAFFBF", "#9BF6FF", "#A0C4FF",
  "#BDB2FF", "#FFC6FF",
];

export function getCategoryIcon(key?: string): LucideIcon {
  if (key && CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  return Tag;
}

// Resolve icon for a category name by checking DEFAULT_CATEGORIES mapping
export function getIconForCategory(categoryName: string, customIcon?: string): LucideIcon {
  if (customIcon && CATEGORY_ICONS[customIcon]) return CATEGORY_ICONS[customIcon];
  const def = DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  if (def?.icon && CATEGORY_ICONS[def.icon]) return CATEGORY_ICONS[def.icon];
  return Tag;
}

export function getColorForCategory(categoryName: string, customColor?: string): string {
  if (customColor) return customColor;
  const def = DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  return def?.color || "hsl(var(--wash-sage))";
}