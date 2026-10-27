import { ChangePasswordManagement } from "@/components/admin/change-password-management";
import { DisplayConfigManagement } from "@/components/admin/display-config-management";
import { NotificationConfigManagement } from "@/components/admin/notification-config-management";
import { RegistrationCashbackConfigManagement } from "@/components/admin/registration-cashback-config-management";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <RegistrationCashbackConfigManagement />
      <NotificationConfigManagement />
      <DisplayConfigManagement />
      <ChangePasswordManagement />
    </div>
  );
}
