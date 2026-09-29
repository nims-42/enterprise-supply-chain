"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import OrganizationSwitcher from "@/components/OrganizationSwitcher";

// Modules from the implementation plan. `ready: false` ones are shown
// greyed out until they are built, so the navigation already reflects the
// whole system.
const navItems = [
  { href: "/", label: "Dashboard", ready: true },
  { href: "/products", label: "Products", ready: true },
  { href: "/producers", label: "Producers", ready: true },
  { href: "/warehouses", label: "Warehouses", ready: true },
  { href: "/inventory", label: "Inventory", ready: true },
  { href: "/customers", label: "Customers", ready: true },
  { href: "/orders", label: "Orders", ready: true },
  { href: "/shipments", label: "Shipments", ready: true },
  { href: "/transport", label: "Transport", ready: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-5 py-5 border-b border-slate-200">
        <p className="text-sm font-semibold text-slate-900">Supply chain management system</p>
      </div>
      <div className="px-5 py-4 border-b border-slate-200">
        <OrganizationSwitcher />
      </div>
      <nav className="p-3 space-y-1">
        {navItems.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          if (!item.ready) {
            return (
              <span
                key={item.href}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
              >
                {item.label}
                <span className="text-[10px] uppercase tracking-wide">soon</span>
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
