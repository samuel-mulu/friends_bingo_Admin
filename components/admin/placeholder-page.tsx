import { Construction } from "lucide-react";

import {
  Card,
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
      </Card>
    </div>
  );
}
