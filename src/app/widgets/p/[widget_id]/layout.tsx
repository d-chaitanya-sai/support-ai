import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI E-commerce Support Assistant Chat Widget",
  description: "AI-powered e-commerce customer support chat",
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="antialiased bg-background min-h-screen">
      {children}
    </div>
  );
}
