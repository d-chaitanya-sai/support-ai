"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const knowledgeNav = [
  { name: "Overview", href: "/dashboard/knowledge" },
  { name: "Documents", href: "/dashboard/knowledge/documents" },
  { name: "Website Crawler", href: "/dashboard/knowledge/crawler" },
  { name: "FAQs", href: "/dashboard/knowledge/faqs" },
];

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 p-2 w-fit bg-neutral-600 rounded-xl overflow-x-auto">
        {knowledgeNav.map((item) => {
          const isActive = item.href === "/dashboard/knowledge"
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <span className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-white hover:text-white/80"
              )}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
