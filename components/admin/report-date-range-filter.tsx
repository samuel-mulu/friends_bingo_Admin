"use client";

import { CalendarRange, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ReportDateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onReset,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-end">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground sm:mr-2">
        <CalendarRange className="size-4 text-primary" />
        Date range
      </div>
      <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,180px)_minmax(0,180px)]">
        <div className="space-y-2">
          <Label htmlFor="report-from">From</Label>
          <Input
            id="report-from"
            type="date"
            value={from}
            onChange={(event) => onFromChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="report-to">To</Label>
          <Input
            id="report-to"
            type="date"
            value={to}
            onChange={(event) => onToChange(event.target.value)}
          />
        </div>
      </div>
      <Button variant="outline" onClick={onReset}>
        <RotateCcw className="size-4" />
        Reset
      </Button>
    </div>
  );
}
