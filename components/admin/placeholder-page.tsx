import { Construction } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <Card className="border-dashed border-border/80 bg-card/80">
        <CardHeader>
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Construction className="size-6" />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-6">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-dashed border-border/80 bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is intentionally scoped as a clean placeholder for the
            first admin foundation. Data tables, filters, and actions can plug
            in here next without reworking the layout shell.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
