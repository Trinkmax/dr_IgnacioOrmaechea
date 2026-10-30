import {
  Calculator,
  CalendarDays,
  Home,
  Receipt,
  Settings,
  Sparkles,
  Truck,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  group: "consultorio" | "finanzas" | "catalogo" | "sistema";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home, group: "consultorio" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, group: "consultorio" },
  { href: "/pacientes", label: "Pacientes", icon: UsersRound, group: "consultorio" },
  { href: "/cobros", label: "Cobros", icon: Wallet, group: "finanzas" },
  { href: "/gastos", label: "Gastos", icon: Receipt, group: "finanzas", adminOnly: true },
  { href: "/proveedores", label: "Proveedores", icon: Truck, group: "finanzas", adminOnly: true },
  { href: "/tratamientos", label: "Tratamientos", icon: Sparkles, group: "catalogo" },
  { href: "/calculadora", label: "Calculadora", icon: Calculator, group: "catalogo", adminOnly: true },
  { href: "/ajustes", label: "Ajustes", icon: Settings, group: "sistema" },
];

export const NAV_GROUPS: { id: NavItem["group"]; label: string }[] = [
  { id: "consultorio", label: "Consultorio" },
  { id: "finanzas", label: "Finanzas" },
  { id: "catalogo", label: "Catálogo" },
];

export function navFor(role: Role) {
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
