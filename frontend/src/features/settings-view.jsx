import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SettingsView({ settings, setSettings }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Global defaults for provider and target path used across workflows.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <label className="text-sm">Provider</label>
        <Select value={settings.provider} onValueChange={(v) => setSettings({ ...settings, provider: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{["codex_cli", "openai", "anthropic"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <label className="text-sm">Default target path</label>
        <Input value={settings.targetPath} onChange={(e) => setSettings({ ...settings, targetPath: e.target.value })} />
      </CardContent>
    </Card>
  );
}
