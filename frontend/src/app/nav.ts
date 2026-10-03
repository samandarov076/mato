import {
  ArrowLeftRight,
  Building2,
  ChartColumn,
  HandCoins,
  House,
  Layers,
  PackagePlus,
  Settings,
  ShoppingCart,
  Tags,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/shared/api/client";
import type { Tone } from "@/shared/ui/tones";

/**
 * Rol bo'yicha menyu (docs/04-sahifalar-xaritasi.md).
 * `to` yo'q bo'lsa — bo'lim hali qurilmagan: menyuda xira ko'rinadi va bosilmaydi.
 * Modul tayyor bo'lganda shu yerga `to` qo'shiladi, xolos.
 */
export type NavItem = {
  key: string;
  icon: LucideIcon;
  /** Bo'limning rangi — menyuda va sahifa sarlavhasida bir xil */
  tone: Tone;
  to?: string;
  /** Bo'limning ichki sahifalari boshqa manzillarda bo'lsa (masalan "/" → "/businesses/5") */
  activePrefix?: string | string[];
};

const home: NavItem = { key: "home", icon: House, tone: "indigo", to: "/" };

const NAV: Record<Role, NavItem[]> = {
  owner: [
    home,
    { key: "sales", icon: ShoppingCart, tone: "leaf", to: "/sales" },
    { key: "credit", icon: HandCoins, tone: "saffron", to: "/customers" },
    // "Ombor" bo'limi: Qoldiq · Kirimlar · Ko'chirishlar · Metr farqi (varaqlar — InventoryHeader)
    {
      key: "inventory",
      icon: Warehouse,
      tone: "sky",
      to: "/stock",
      activePrefix: ["/receiving", "/transfers", "/differences", "/batches"],
    },
    { key: "catalog", icon: Tags, tone: "plum", to: "/catalog" },
    { key: "reports", icon: ChartColumn, tone: "coral", to: "/reports" },
    { key: "structure", icon: Building2, tone: "rose", to: "/structure" },
    { key: "settings", icon: Settings, tone: "neutral", to: "/settings" },
  ],
  warehouse: [
    { key: "stock", icon: Layers, tone: "sky", to: "/stock", activePrefix: "/batches" },
    { key: "receiving", icon: PackagePlus, tone: "leaf", to: "/receiving" },
    { key: "transfers", icon: ArrowLeftRight, tone: "coral", to: "/transfers" },
    { key: "catalog", icon: Tags, tone: "plum", to: "/catalog" },
  ],
  seller: [],
  platform_owner: [
    { key: "businesses", icon: Building2, tone: "indigo", to: "/", activePrefix: "/businesses" },
  ],
};

export function navFor(role: Role): NavItem[] {
  return NAV[role];
}
