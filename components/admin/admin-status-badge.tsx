import { Badge } from "@/components/ui/badge";

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AdminStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();

  const variant =
    normalized === "APPROVED" ||
    normalized === "PAID" ||
    normalized === "ACTIVE"
      ? "secondary"
      : normalized === "PENDING"
        ? "outline"
        : normalized === "REJECTED" ||
            normalized === "FAILED" ||
            normalized === "BLOCKED"
          ? "destructive"
          : "outline";

  return <Badge variant={variant}>{formatStatusLabel(normalized)}</Badge>;
}
