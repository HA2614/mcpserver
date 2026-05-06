import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PathPickerDialog } from "@/components/path-picker-dialog";

export function CodeWorkerView({
  codeRoot,
  setCodeRoot,
  codePrompt,
  setCodePrompt,
  codeJob,
  codeBusy,
  codeLogs,
  startCodeWorker,
  applyCurrentCodeJob,
  rejectCurrentCodeJob
}) {
  const files = Array.isArray(codeJob?.changed_files) ? codeJob.changed_files : [];
  const risks = Array.isArray(codeJob?.risk_notes) ? codeJob.risk_notes : [];
  const tests = Array.isArray(codeJob?.test_commands) ? codeJob.test_commands : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI Code Worker</CardTitle>
          <CardDescription>Prompt in, verbeterde prompt en reviewbare codevoorstellen terug.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input value={codeRoot} onChange={(e) => setCodeRoot(e.target.value)} placeholder="Project root path" />
            <PathPickerDialog value={codeRoot} onSelect={setCodeRoot} />
          </div>
          <Textarea className="min-h-[140px]" value={codePrompt} onChange={(e) => setCodePrompt(e.target.value)} placeholder="Describe the code change..." />
          <div className="flex flex-wrap gap-2">
            <Button onClick={startCodeWorker} disabled={codeBusy || !codePrompt.trim()}>{codeBusy ? "Running..." : "Start Code Job"}</Button>
            <Button variant="outline" onClick={applyCurrentCodeJob} disabled={codeJob?.status !== "awaiting_review"}>Apply</Button>
            <Button variant="outline" onClick={rejectCurrentCodeJob} disabled={codeJob?.status !== "awaiting_review"}>Reject</Button>
          </div>
        </CardContent>
      </Card>

      {codeJob ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Job #{codeJob.id} - {codeJob.status}</CardTitle>
            <CardDescription>{codeJob.diff_summary || codeJob.final_status || "Waiting for output."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-sm font-medium">Improved Prompt</p>
                <ScrollArea className="h-[190px] rounded-md border bg-secondary/20 p-3 text-xs">
                  <pre>{codeJob.improved_prompt || ""}</pre>
                </ScrollArea>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Web Terminal</p>
                <ScrollArea className="h-[190px] rounded-md border bg-black p-3 text-xs text-green-200">
                  <pre>{codeLogs.map((l) => `[${l.ts || ""}] ${l.message || JSON.stringify(l)}`).join("\n")}</pre>
                </ScrollArea>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-sm font-medium">Changed Files</p>
                <div className="space-y-2">
                  {files.length ? files.map((file, i) => (
                    <div key={`${file.path}-${i}`} className="rounded-md border p-2 text-sm">
                      <div className="font-medium">{file.path}</div>
                      <div className="text-muted-foreground">{file.diffSummary || file.action}</div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No files proposed yet.</p>}
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Risk Notes</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">{risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Tests</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">{tests.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
