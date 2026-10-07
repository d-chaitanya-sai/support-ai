"use client";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Loader2, LayoutDashboard, Ticket, BookOpen, Settings, ExternalLink, LogOut, ChevronRight, Menu, Bot, BarChart3, Plug, Shield, Sun, Moon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { name: "Tickets", href: "/dashboard/tickets", icon: Ticket },
  {
    name: "Knowledge",
    href: "/dashboard/knowledge",
    icon: BookOpen,
    children: [
      { name: "Overview", href: "/dashboard/knowledge" },
      { name: "Documents", href: "/dashboard/knowledge/documents" },
      { name: "Website Crawler", href: "/dashboard/knowledge/crawler" },
      { name: "FAQs", href: "/dashboard/knowledge/faqs" },
    ],
  },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Integrations", href: "/dashboard/integrations", icon: Plug },
  { name: "Trust", href: "/dashboard/trust", icon: Shield },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

function pageTitleFor(pathname: string) {
  for (const item of navItems) {
    if (item.children) {
      const child = item.children.find((c) => c.href === pathname);
      if (child) return child.name === "Overview" ? "Knowledge" : `Knowledge · ${child.name}`;
    }
    if (item.exact ? pathname === item.href : pathname.startsWith(item.href)) {
      return item.name;
    }
  }
  return "Dashboard";
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-8 w-8" />;

  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(pathname.startsWith("/dashboard/knowledge"));

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (pathname.startsWith("/dashboard/knowledge")) setKnowledgeOpen(true);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
 
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border gap-2.5 shrink-0">
    
        <span className="font-bold text-[25px] tracking-tight">Support AI.</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href) && item.href !== "/dashboard";
          const hasChildren = !!item.children;

          return (
            <div key={item.name}>
              <button
                onClick={() => {
                  if (hasChildren) {
                    setKnowledgeOpen((v) => !v);
                  } else {
                    router.push(item.href);
                    setSidebarOpen(false);
                  }
                }}
                className={cn(
                  "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" />
                )}
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{item.name}</span>
                {hasChildren && (
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", knowledgeOpen && "rotate-90")} />
                )}
              </button>

              {hasChildren && knowledgeOpen && (
                <div className="ml-7 mt-0.5 space-y-0.5 border-l border-border pl-3">
                  {item.children!.map((child) => {
                    const childActive = pathname === child.href;
                    return (
                      <Link key={child.href} href={child.href} onClick={() => setSidebarOpen(false)}>
                        <span className={cn(
                          "block px-2 py-1.5 rounded text-xs transition-all",
                          childActive
                            ? "text-primary font-semibold bg-primary/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}>
                          {child.name}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* My Widget */}
      <div className="px-3 pb-2 space-y-0.5">
        <a
          href={`/widgets/p/${user.widgetId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
        >
          <ExternalLink className="h-4 w-4" />
          My Chat Widget
        </a>
      </div>

      {/* User */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3 px-1">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.photoUrl} />
            <AvatarFallback className="text-xs">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full gap-2 text-muted-foreground" onClick={logout}>
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25 }}
              className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-50 md:hidden flex flex-col"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 md:hidden justify-between shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
     
            <span className="font-semibold text-sm">AI E-commerce Support Assistant</span>
          </div>
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.photoUrl} />
            <AvatarFallback className="text-xs">{user.name.charAt(0)}</AvatarFallback>
          </Avatar>
        </header>

     

        <div className="flex-1 overflow-y-auto bg-muted/20 p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
