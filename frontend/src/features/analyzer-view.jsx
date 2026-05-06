import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PathPickerDialog } from "@/components/path-picker-dialog";

export function AnalyzerView({ analysisPath, setAnalysisPath, runCodebaseSummary, analysisBusy, analysisJob, analysisResult, savedSummaries, loadSavedSummaries, setAnalysisResult, setError, getSummaryById }) {
  const parsed = parseReport(analysisResult);
  const checks = Array.isArray(analysisResult?.improvementChecks) ? analysisResult.improvementChecks : [];
  const styleProfile = analysisResult?.styleProfile || {};
  const events = Array.isArray(analysisResult?.learningEvents) ? analysisResult.learningEvents : [];
  const styleItems = styleProfile.observations || parsed?.codeStyleObservations || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Codebase Analyzer</CardTitle>
          <CardDescription>Structured analysis, function improvements, and learning checks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input value={analysisPath} onChange={(e) => setAnalysisPath(e.target.value)} placeholder="Folder path" />
            <PathPickerDialog value={analysisPath} onSelect={setAnalysisPath} />
            <Button onClick={() => runCodebaseSummary().catch((e) => { setError(e.message); })} disabled={analysisBusy}>{analysisBusy ? "Analyzing..." : "Analyze Folder"}</Button>
          </div>
          {analysisJob ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex justify-between text-sm"><span>{analysisJob.stage}</span><span>{analysisJob.progress || 0}%</span></div>
              <Progress value={analysisJob.progress || 0} />
              <p className="text-xs text-muted-foreground">{analysisJob.message}</p>
              <ScrollArea className="h-[180px] rounded-md border bg-secondary/20 p-2">
                <pre className="text-xs">{Array.isArray(analysisJob.logs) ? analysisJob.logs.map((l) => `[${l.ts}] (${l.source}) ${l.line}`).join("\n") : "Waiting for output..."}</pre>
              </ScrollArea>
            </div>
          ) : null}
          {analysisResult ? (
            <div className="space-y-3">
              <Card className="bg-secondary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{parsed?.title || analysisResult.title || "Analysis"}</CardTitle>
                  <CardDescription>{parsed?.projectDescription || analysisResult.description}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <div><strong>Root:</strong> {analysisResult.root}</div>
                  <div><strong>Architecture:</strong> {(parsed?.architectureOverview || []).slice(0, 4).join(" | ") || "-"}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Function Improvements</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(parsed?.improvementSuggestions || []).length ? parsed.improvementSuggestions.slice(0, 12).map((s, i) => (
                    <div key={`${s.file}-${s.function}-${i}`} className="rounded border p-2 text-sm">
                      <div><strong>{s.priority?.toUpperCase() || "INFO"}</strong> | {s.file} | {s.function}</div>
                      <div className="text-muted-foreground">Issue: {s.issue}</div>
                      <div>Suggestion: {s.suggestion}</div>
                      {s.followUpCriteria ? <div className="text-muted-foreground">Check: {s.followUpCriteria}</div> : null}
                    </div>
                  )) : <div className="text-sm text-muted-foreground">No suggestions returned.</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Previous Improvements</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {checks.length ? checks.slice(0, 10).map((check) => (
                    <div key={check.id} className="rounded border p-2 text-sm">
                      <div className="font-medium">{check.status}</div>
                      <div className="text-muted-foreground">{check.explanation}</div>
                    </div>
                  )) : <div className="text-sm text-muted-foreground">No previous checks yet.</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Style Profile</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {styleItems.length ? styleItems.slice(0, 8).map((item, i) => <div key={i} className="rounded border p-2">{item}</div>) : <div className="text-muted-foreground">No style profile yet.</div>}
                  {events.length ? <div className="text-muted-foreground">Latest learning event: {events[0].event_type}</div> : null}
                </CardContent>
              </Card>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Raw JSON</summary>
                <pre className="mt-2 rounded-md border bg-secondary/20 p-3 text-xs">{analysisResult.fullReport || "No report returned."}</pre>
              </details>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Saved Summaries</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={() => loadSavedSummaries().catch((e) => setError(e.message))}>Refresh</Button>
          <div className="grid gap-2">
            {savedSummaries.map((s) => (
              <Button key={s.id} variant="ghost" className="justify-start" onClick={() => getSummaryById(s.id).then((data) => setAnalysisResult({ title: data.title, description: data.description, root: data.root_path, fullReport: data.full_report, analysisJson: data.analysis_json, summaryId: data.id })).catch((e) => setError(e.message))}>
                #{s.id} {s.title}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function parseReport(analysisResult) {
  if (!analysisResult) return null;
  if (analysisResult.analysisJson && typeof analysisResult.analysisJson === "object") return analysisResult.analysisJson;
  try {
    return JSON.parse(analysisResult.fullReport || "{}");
  } catch {
    return null;
  }
}
