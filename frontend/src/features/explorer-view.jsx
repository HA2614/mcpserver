import React, { useMemo, useState } from "react";
import { Folder, FileText, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ExplorerView({
  currentPath, setCurrentPath, parentPath, entries, tree, loadExplorer, openEntry, selectedPaths, toggleSelect,
  openFilePath, setOpenFilePath, openFileContent, setOpenFileContent, dirtyFile, setDirtyFile, saveFile, fsConnected,
  createFolder, createFile, renameSelected, deleteSelected, copySelected, moveSelected, filter, setFilter
}) {
  const filtered = useMemo(() => entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase())), [entries, filter]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>File Explorer {fsConnected ? "• Live" : "• Polling fallback"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => parentPath && loadExplorer(parentPath)} disabled={!parentPath}>Up</Button>
          <Button variant="outline" onClick={() => loadExplorer(currentPath)}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Input value={currentPath} onChange={(e) => setCurrentPath(e.target.value)} />
          <Button onClick={() => loadExplorer(currentPath)}>Go</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={createFolder}>New Folder</Button>
          <Button variant="outline" onClick={createFile}>New File</Button>
          <Button variant="outline" onClick={renameSelected} disabled={selectedPaths.length !== 1}>Rename</Button>
          <Button variant="outline" onClick={copySelected} disabled={!selectedPaths.length}>Copy</Button>
          <Button variant="outline" onClick={moveSelected} disabled={!selectedPaths.length}>Move</Button>
          <Button variant="destructive" onClick={deleteSelected} disabled={!selectedPaths.length}>Delete</Button>
          <Input className="max-w-xs" placeholder="Search this folder..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
          <div className="rounded-md border p-2">
            <p className="mb-2 text-sm font-semibold">Folders</p>
            <ScrollArea className="h-[360px]">
              <TreeNode node={tree} onOpen={loadExplorer} />
            </ScrollArea>
          </div>
          <div className="rounded-md border">
            <div className="grid grid-cols-[36px_1fr_120px_180px] border-b bg-secondary/40 px-3 py-2 text-xs font-semibold">
              <div />
              <div>Name</div>
              <div>Size</div>
              <div>Date Modified</div>
            </div>
            <ScrollArea className="h-[360px]">
              <div>
                {filtered.map((e) => (
                  <button
                    key={e.path}
                    onDoubleClick={() => openEntry(e)}
                    onClick={(ev) => toggleSelect(e.path, ev.ctrlKey || ev.metaKey)}
                    className={`grid w-full grid-cols-[36px_1fr_120px_180px] px-3 py-2 text-left text-sm hover:bg-secondary/40 ${selectedPaths.includes(e.path) ? "bg-primary/10" : ""}`}
                  >
                    <div>{e.kind === "directory" ? <Folder className="h-4 w-4 text-amber-500" /> : <FileText className="h-4 w-4 text-slate-500" />}</div>
                    <div>{e.name}</div>
                    <div>{e.sizeLabel}</div>
                    <div>{new Date(e.modifiedAt).toLocaleString()}</div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Selected: {selectedPaths.length} item(s)</p>
        <p className="text-sm font-medium">Editor {dirtyFile ? "(unsaved changes)" : ""}</p>
        <Input value={openFilePath} onChange={(e) => setOpenFilePath(e.target.value)} placeholder="File path" />
        <Textarea className="min-h-[260px] font-mono text-xs" value={openFileContent} onChange={(e) => { setOpenFileContent(e.target.value); setDirtyFile(true); }} />
        <Button onClick={saveFile} disabled={!openFilePath}>Save File</Button>
      </CardContent>
    </Card>
  );
}

function TreeNode({ node, onOpen, level = 0 }) {
  if (!node || node.kind !== "directory") return null;
  return (
    <div>
      <button onClick={() => onOpen(node.path)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-secondary/40" style={{ paddingLeft: `${8 + level * 14}px` }}>
        <Folder className="h-4 w-4 text-amber-500" />
        {node.name || node.path}
      </button>
      {Array.isArray(node.children) ? node.children.map((child) => <TreeNode key={child.path} node={child} onOpen={onOpen} level={level + 1} />) : null}
    </div>
  );
}
