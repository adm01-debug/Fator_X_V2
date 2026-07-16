import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const OFFLINE_TITLE = 'Sem conexão com a internet';
const OFFLINE_DESCRIPTION =
  'Verifique sua conexão. O sistema entrará em modo de segurança.';

function showOfflineToast() {
  toast.error(OFFLINE_TITLE, {
    id: 'network-offline',
    description: OFFLINE_DESCRIPTION,
    duration: Infinity,
    action: {
      label: 'Tentar Reconectar',
      onClick: () => window.location.reload(),
    },
  });
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    // Fire immediately when we mount already offline so the user sees feedback.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showOfflineToast();
    }

    const handleOffline = () => {
      setIsOnline(false);
      showOfflineToast();
    };

    const handleOnline = () => {
      setIsOnline(true);
      toast.dismiss('network-offline');
      toast.success('Conexão restaurada', {
        id: 'network-online',
        duration: 3000,
      });
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return isOnline;
}
