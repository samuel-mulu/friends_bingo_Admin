import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ReportMetricCard({
  title,
  value,
  description,
  icon,
  emphasize = false,
}: {
  title: string;
  value: string;
  description: string;
  icon?: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <Card className={emphasize ? "border-primary/20 bg-primary/5" : undefined}>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription>{title}</CardDescription>
            <CardTitle className="text-2xl">{value}</CardTitle>
          </div>
          {icon ? (
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {icon}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
