import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('Sem conexão com a internet', {
        id: 'network-offline',
        description: 'Verifique sua conexão. O sistema entrará em modo de segurança.',
        duration: Infinity,
        action: {
          label: 'Tentar Reconectar',
          onClick: () => window.location.reload(),
        },
      });
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

    // Detect the case where the app is loaded while already offline —
    // the 'offline' event won't fire on mount, so check explicitly.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return isOnline;
}
