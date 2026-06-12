import { toast } from "sonner";

export const adminToast = {
  success(message: string) {
    toast.success(message);
  },
  info(message: string) {
    toast.info(message);
  },
  error(message: string) {
    toast.error(message);
  },
};
