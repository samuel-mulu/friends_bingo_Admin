import { AppVersionConfigManagement } from "@/components/admin/app-version-config-management";
import { ChangePasswordManagement } from "@/components/admin/change-password-management";
import { DepositManualApprovalPinManagement } from "@/components/admin/deposit-manual-approval-pin-management";
import { DisplayConfigManagement } from "@/components/admin/display-config-management";
import { NotificationConfigManagement } from "@/components/admin/notification-config-management";
import { RegistrationCashbackConfigManagement } from "@/components/admin/registration-cashback-config-management";
import { SupportConfigManagement } from "@/components/admin/support-config-management";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <RegistrationCashbackConfigManagement />
      <NotificationConfigManagement />
      <DisplayConfigManagement />
      <SupportConfigManagement />
      <AppVersionConfigManagement />
      <DepositManualApprovalPinManagement />
      <ChangePasswordManagement />
    </div>
  );
}
