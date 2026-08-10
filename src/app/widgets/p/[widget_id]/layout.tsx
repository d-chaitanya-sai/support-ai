import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SupportAI Chat Widget",
  description: "AI-powered customer support chat",
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="antialiased bg-background min-h-screen">
      {children}
    </div>
  );
}
