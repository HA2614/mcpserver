import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AppShell({ tab, setTab, title, children }) {
  const tabs = [
    ["projects", "Projects"],
    ["plans", "Plans"],
    ["structure", "Structure"],
    ["explorer", "Explorer"],
    ["analyzer", "Analyzer"],
    ["code", "AI Code"],
    ["settings", "Settings"]
  ];

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-4 p-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold">MCP Studio</p>
              <p className="text-xs text-muted-foreground">Startup Ops Console</p>
            </div>
          </div>
          <div className="grid gap-2">
            {tabs.map(([value, label]) => (
              <Button key={value} variant={tab === value ? "default" : "ghost"} className={cn("justify-start")} onClick={() => setTab(value)}>
                {label}
              </Button>
            ))}
          </div>
          <div className="mt-5">
            <Badge variant="secondary">Usability-first revamp</Badge>
          </div>
        </aside>

        <main className="space-y-4">
          <header className="rounded-2xl border bg-card p-5 shadow-sm">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Structured workflows with shadcn components and a clean SaaS layout.</p>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
