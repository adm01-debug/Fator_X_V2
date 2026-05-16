import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('Sem conexão com a internet', {
        id: 'network-offline',
        description: 'Verifique sua conexão e tente novamente.',
        duration: Infinity,
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

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return isOnline;
}
