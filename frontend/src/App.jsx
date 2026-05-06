import { useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiPost,
  applyCodeJob,
  createCodeJob,
  fsCopy,
  fsCreateFile,
  fsDeletePath,
  fsList,
  fsMkdir,
  fsMove,
  fsRead,
  fsRename,
  fsTree,
  fsWrite,
  getCodeJob,
  openCodeJobEvents,
  openFsEvents,
  rejectCodeJob
} from "./api";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ProjectsView } from "@/features/projects-view";
import { PlansView } from "@/features/plans-view";
import { StructureView } from "@/features/structure-view";
import { ExplorerView } from "@/features/explorer-view";
import { AnalyzerView } from "@/features/analyzer-view";
import { CodeWorkerView } from "@/features/code-worker-view";
import { SettingsView } from "@/features/settings-view";

const DEFAULT_ROOT = import.meta.env.VITE_DEFAULT_ROOT || "/workspace";

function emptyForm() {
  return { name: "", goals: "", techStack: "", timeline: "", budget: "" };
}

export default function App() {
  const [tab, setTab] = useState("projects");
  const [form, setForm] = useState(emptyForm());
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ provider: "codex_cli", targetPath: DEFAULT_ROOT, profile: "web+api", dryRun: true, overwriteStrategy: "skip_existing", structurePrompt: "" });
  const [historyFilter, setHistoryFilter] = useState({ status: "", provider: "", limit: 20, offset: 0 });
  const [historyRows, setHistoryRows] = useState([]);
  const [compareVersion, setCompareVersion] = useState("");
  const [compareResult, setCompareResult] = useState(null);
  const [structureResult, setStructureResult] = useState(null);
  const [currentPath, setCurrentPath] = useState(DEFAULT_ROOT);
  const [entries, setEntries] = useState([]);
  const [tree, setTree] = useState(null);
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [fsConnected, setFsConnected] = useState(false);
  const [filter, setFilter] = useState("");
  const [parentPath, setParentPath] = useState(null);
  const [openFilePath, setOpenFilePath] = useState("");
  const [openFileContent, setOpenFileContent] = useState("");
  const [dirtyFile, setDirtyFile] = useState(false);
  const [analysisPath, setAnalysisPath] = useState(DEFAULT_ROOT);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisJob, setAnalysisJob] = useState(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [savedSummaries, setSavedSummaries] = useState([]);
  const [codeRoot, setCodeRoot] = useState(DEFAULT_ROOT);
  const [codePrompt, setCodePrompt] = useState("");
  const [codeJob, setCodeJob] = useState(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeLogs, setCodeLogs] = useState([]);

  const selectedLatestPlan = selectedProject?.plans?.[0] || null;
  const selectedLatestJson = selectedLatestPlan?.plan_json || null;
  const sortedMilestones = useMemo(() => [...(selectedLatestJson?.milestones || [])].sort((a, b) => (a.week || 0) - (b.week || 0)), [selectedLatestJson]);

  useEffect(() => {
    refreshProjects().catch((e) => setError(e.message));
    loadExplorer(DEFAULT_ROOT).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const stream = openFsEvents(currentPath);
    let poll = null;
    stream.addEventListener("fs", () => {
      setFsConnected(true);
      loadExplorer(currentPath).catch(() => null);
    });
    stream.onerror = () => {
      setFsConnected(false);
      stream.close();
      poll = setInterval(() => loadExplorer(currentPath).catch(() => null), 4000);
    };
    return () => {
      stream.close();
      if (poll) clearInterval(poll);
    };
  }, [currentPath]);

  useEffect(() => {
    if (!codeJob?.id || !["queued", "planning", "running"].includes(codeJob.status)) return;
    const stream = openCodeJobEvents(codeJob.id);
    const poll = setInterval(() => {
      getCodeJob(codeJob.id).then((job) => {
        setCodeJob(job);
        if (!["queued", "planning", "running"].includes(job.status)) setCodeBusy(false);
      }).catch(() => null);
    }, 1500);
    stream.addEventListener("code-job", (event) => {
      const payload = JSON.parse(event.data || "{}");
      if (payload.entry) setCodeLogs((prev) => [...prev, payload.entry].slice(-200));
      if (payload.job) {
        setCodeJob(payload.job);
        if (!["queued", "planning", "running"].includes(payload.job.status)) setCodeBusy(false);
      }
    });
    stream.onerror = () => stream.close();
    return () => {
      clearInterval(poll);
      stream.close();
    };
  }, [codeJob?.id, codeJob?.status]);

  async function refreshProjects() {
    const data = await apiGet("/projects");
    setProjects(data);
  }

  async function refreshSelectedProject(projectId = selectedProjectId) {
    if (!projectId) return;
    const data = await apiGet(`/projects/${projectId}`);
    setSelectedProject(data);
    setSelectedProjectId(projectId);
  }

  async function loadHistory(projectId = selectedProjectId) {
    if (!projectId) return;
    const params = new URLSearchParams();
    if (historyFilter.status) params.set("status", historyFilter.status);
    if (historyFilter.provider) params.set("provider", historyFilter.provider);
    params.set("limit", String(historyFilter.limit));
    params.set("offset", String(historyFilter.offset));
    setHistoryRows(await apiGet(`/projects/${projectId}/plans?${params.toString()}`));
  }

  async function loadExplorer(p = currentPath) {
    const data = await fsList(p);
    setCurrentPath(data.path);
    setParentPath(data.parent);
    setEntries(data.entries || []);
    setTree(await fsTree(data.fsRoot || data.path, 3));
    setSelectedPaths([]);
  }

  async function loadSavedSummaries() {
    setSavedSummaries(await apiGet("/analysis/summaries?limit=40&offset=0"));
  }

  async function createProjectAndPlan(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const project = await apiPost("/projects", form);
      await apiPost(`/projects/${project.id}/generate-plan`, { provider: settings.provider });
      await refreshProjects();
      await refreshSelectedProject(project.id);
      setForm(emptyForm());
      setTab("plans");
    } catch (err) {
      setError(err.message || "Failed to create project");
    } finally {
      setBusy(false);
    }
  }

  async function openProject(id) {
    setError("");
    try {
      await refreshSelectedProject(id);
      await loadHistory(id);
      setTab("plans");
    } catch (err) {
      setError(err.message || "Failed to open project");
    }
  }

  async function runCompare() {
    if (!selectedProjectId || !compareVersion) return;
    setCompareResult(await apiGet(`/projects/${selectedProjectId}/plans/compare?againstVersion=${compareVersion}`));
  }

  async function generatePlan(projectId, provider, onRefreshProject, onLoadHistory) {
    await apiPost(`/projects/${projectId}/generate-plan`, { provider });
    await onRefreshProject();
    await onLoadHistory();
  }

  async function getSummaryById(id) {
    return apiGet(`/analysis/summaries/${id}`);
  }

  async function promoteBaseline(planId) {
    await apiPost(`/plans/${planId}/promote-baseline`, {});
    await refreshSelectedProject();
    await loadHistory();
  }

  async function updateFeedback(planId, action) {
    await apiPost(`/plans/${planId}/feedback`, { action, comments: "from frontend" });
    await refreshSelectedProject();
    await loadHistory();
  }

  async function runStructure() {
    if (!selectedProjectId) return;
    const out = await apiPost(`/projects/${selectedProjectId}/generate-structure`, {
      targetPath: settings.targetPath,
      profile: settings.profile,
      dryRun: settings.dryRun,
      overwriteStrategy: settings.overwriteStrategy,
      structurePrompt: settings.structurePrompt || ""
    });
    setStructureResult(out);
    if (out.root) await loadExplorer(out.root);
    setTab("structure");
  }

  async function openFile(filePath) {
    if (dirtyFile && !window.confirm("Unsaved changes will be lost. Continue?")) return;
    const data = await fsRead(filePath);
    setOpenFilePath(data.path);
    setOpenFileContent(data.content);
    setDirtyFile(false);
  }

  async function saveFile() {
    if (!openFilePath) return;
    await fsWrite(openFilePath, openFileContent, "overwrite");
    setDirtyFile(false);
  }

  function toggleSelect(targetPath, additive) {
    if (additive) {
      setSelectedPaths((prev) => prev.includes(targetPath) ? prev.filter((p) => p !== targetPath) : [...prev, targetPath]);
      return;
    }
    setSelectedPaths([targetPath]);
  }

  async function openEntry(entry) {
    if (entry.kind === "directory") {
      await loadExplorer(entry.path);
      return;
    }
    await openFile(entry.path);
  }

  async function createFolder() {
    const name = window.prompt("New folder name");
    if (!name) return;
    await fsMkdir(`${currentPath}\\${name}`);
    await loadExplorer(currentPath);
  }

  async function createFile() {
    const name = window.prompt("New file name");
    if (!name) return;
    await fsCreateFile(`${currentPath}\\${name}`, "", "fail");
    await loadExplorer(currentPath);
  }

  async function renameSelected() {
    if (selectedPaths.length !== 1) return;
    const newName = window.prompt("Rename to");
    if (!newName) return;
    await fsRename(selectedPaths[0], newName, "fail");
    await loadExplorer(currentPath);
  }

  async function deleteSelected() {
    if (!selectedPaths.length) return;
    if (!window.confirm(`Delete ${selectedPaths.length} item(s)?`)) return;
    await Promise.all(selectedPaths.map((p) => fsDeletePath(p)));
    await loadExplorer(currentPath);
  }

  async function copySelected() {
    if (!selectedPaths.length) return;
    const destinationDir = window.prompt("Copy to folder path", currentPath);
    if (!destinationDir) return;
    await Promise.all(selectedPaths.map((p) => fsCopy(p, `${destinationDir}\\${p.split("\\").pop()}`, "fail")));
    await loadExplorer(currentPath);
  }

  async function moveSelected() {
    if (!selectedPaths.length) return;
    const destinationDir = window.prompt("Move to folder path", currentPath);
    if (!destinationDir) return;
    await Promise.all(selectedPaths.map((p) => fsMove(p, `${destinationDir}\\${p.split("\\").pop()}`, "fail")));
    await loadExplorer(currentPath);
  }

  async function runCodebaseSummary() {
    setAnalysisBusy(true);
    setAnalysisResult(null);
    try {
      const started = await apiPost("/analysis/summarize-codebase/start", { targetPath: analysisPath });
      setAnalysisJob(started);
      const jobId = started.jobId;
      let keepPolling = true;
      while (keepPolling) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const job = await apiGet(`/analysis/summarize-codebase/jobs/${jobId}`);
        setAnalysisJob(job);
        if (job.status === "done") {
          setAnalysisResult(job.result);
          await loadSavedSummaries();
          keepPolling = false;
        }
        if (job.status === "failed") throw new Error(job.error?.message || job.message || "Analysis failed");
      }
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function startCodeWorker() {
    setCodeBusy(true);
    setCodeLogs([]);
    try {
      const job = await createCodeJob(codeRoot, codePrompt);
      setCodeJob(job);
      const latest = await getCodeJob(job.id);
      setCodeJob(latest);
    } catch (err) {
      setError(err.message || "Failed to start code job");
      setCodeBusy(false);
    }
  }

  async function applyCurrentCodeJob() {
    if (!codeJob?.id) return;
    setCodeJob(await applyCodeJob(codeJob.id));
  }

  async function rejectCurrentCodeJob() {
    if (!codeJob?.id) return;
    setCodeJob(await rejectCodeJob(codeJob.id));
  }

  const title = tab === "plans" ? "Plan Workspace" : tab.charAt(0).toUpperCase() + tab.slice(1);

  return (
    <AppShell tab={tab} setTab={setTab} title={title}>
      {error ? (
        <Alert className="border-destructive/40 bg-destructive/10 text-destructive">
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {tab === "projects" ? <ProjectsView form={form} setForm={setForm} busy={busy} createProjectAndPlan={createProjectAndPlan} projects={projects} refreshProjects={refreshProjects} openProject={openProject} /> : null}
      {tab === "plans" ? <PlansView selectedProjectId={selectedProjectId} selectedLatestJson={selectedLatestJson} selectedLatestPlan={selectedLatestPlan} sortedMilestones={sortedMilestones} settings={settings} refreshSelectedProject={refreshSelectedProject} loadHistory={loadHistory} updateFeedback={updateFeedback} promoteBaseline={promoteBaseline} historyFilter={historyFilter} setHistoryFilter={setHistoryFilter} historyRows={historyRows} compareVersion={compareVersion} setCompareVersion={setCompareVersion} runCompare={runCompare} compareResult={compareResult} generatePlan={generatePlan} /> : null}
      {tab === "structure" ? <StructureView settings={settings} setSettings={setSettings} runStructure={runStructure} selectedProjectId={selectedProjectId} structureResult={structureResult} /> : null}
      {tab === "explorer" ? <ExplorerView parentPath={parentPath} loadExplorer={loadExplorer} currentPath={currentPath} setCurrentPath={setCurrentPath} entries={entries} tree={tree} openEntry={openEntry} selectedPaths={selectedPaths} toggleSelect={toggleSelect} openFilePath={openFilePath} setOpenFilePath={setOpenFilePath} openFileContent={openFileContent} setOpenFileContent={setOpenFileContent} dirtyFile={dirtyFile} setDirtyFile={setDirtyFile} saveFile={saveFile} fsConnected={fsConnected} createFolder={createFolder} createFile={createFile} renameSelected={renameSelected} deleteSelected={deleteSelected} copySelected={copySelected} moveSelected={moveSelected} filter={filter} setFilter={setFilter} /> : null}
      {tab === "analyzer" ? <AnalyzerView analysisPath={analysisPath} setAnalysisPath={setAnalysisPath} runCodebaseSummary={runCodebaseSummary} analysisBusy={analysisBusy} analysisJob={analysisJob} analysisResult={analysisResult} savedSummaries={savedSummaries} loadSavedSummaries={loadSavedSummaries} setAnalysisResult={(data) => {
        let parsed = data.analysisJson || data.analysis_json || null;
        try { parsed = JSON.parse(data.fullReport || "{}"); } catch {}
        setAnalysisResult({ ...data, analysisJson: parsed });
      }} setError={setError} getSummaryById={getSummaryById} /> : null}
      {tab === "code" ? <CodeWorkerView codeRoot={codeRoot} setCodeRoot={setCodeRoot} codePrompt={codePrompt} setCodePrompt={setCodePrompt} codeJob={codeJob} codeBusy={codeBusy} codeLogs={codeLogs} startCodeWorker={startCodeWorker} applyCurrentCodeJob={applyCurrentCodeJob} rejectCurrentCodeJob={rejectCurrentCodeJob} /> : null}
      {tab === "settings" ? <SettingsView settings={settings} setSettings={setSettings} /> : null}
    </AppShell>
  );
}
