import { useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { setStoreToastHandlers } from '@/store/useAppStore';

export default function ToastBridge() {
  const toast = useToast();

  useEffect(() => {
    setStoreToastHandlers({
      showSuccess: toast.showSuccess,
      showError: toast.showError,
      showWarning: toast.showWarning,
      showInfo: toast.showInfo,
    });
  }, [toast]);

  return null;
}
