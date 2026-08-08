import { ChangePasswordManagement } from "@/components/admin/change-password-management";
import { DisplayConfigManagement } from "@/components/admin/display-config-management";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <DisplayConfigManagement />
      <ChangePasswordManagement />
    </div>
  );
}
