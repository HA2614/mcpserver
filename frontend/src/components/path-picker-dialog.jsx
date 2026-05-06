import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fsList } from "@/api";

export function PathPickerDialog({ value, onSelect, triggerLabel = "Browse" }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value || "");
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!open || !current) return;
    fsList(current).then((data) => setItems(data.entries || [])).catch(() => setItems([]));
  }, [open, current]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">{triggerLabel}</Button></DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Select Path</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input value={current} onChange={(e) => setCurrent(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrent((p) => p.split("\\").slice(0, -1).join("\\") || p)}>Up</Button>
            <Button variant="outline" onClick={() => fsList(current).then((d) => setItems(d.entries || []))}>Refresh</Button>
            <Button onClick={() => { onSelect(current); setOpen(false); }}>Use This Path</Button>
          </div>
          <ScrollArea className="h-[320px] rounded-md border p-2">
            <div className="grid gap-1">
              {items.filter((x) => x.kind === "directory").map((d) => (
                <Button key={d.path} variant="ghost" className="justify-start" onClick={() => setCurrent(d.path)}>
                  {d.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
