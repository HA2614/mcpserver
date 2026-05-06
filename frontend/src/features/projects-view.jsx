import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ProjectsView({ form, setForm, busy, createProjectAndPlan, projects, refreshProjects, openProject }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())), [projects, query]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Create Project</CardTitle>
          <CardDescription>Define goals and kick off plan generation in one step.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={createProjectAndPlan}>
            <Input placeholder="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Textarea placeholder="Goals" value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} required />
            <Input placeholder="Tech stack" value={form.techStack} onChange={(e) => setForm({ ...form, techStack: e.target.value })} />
            <Input placeholder="Timeline" value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })} />
            <Input placeholder="Budget" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            <Button type="submit" disabled={busy}>{busy ? "Working..." : "Create + Generate"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Search and open projects quickly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Search projects..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button variant="outline" onClick={refreshProjects}>Refresh</Button>
          </div>
          <ScrollArea className="h-[360px] rounded-md border p-2">
            <div className="grid gap-2">
              {filtered.map((project) => (
                <Button key={project.id} variant="ghost" className="justify-start" onClick={() => openProject(project.id)}>
                  #{project.id} {project.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
