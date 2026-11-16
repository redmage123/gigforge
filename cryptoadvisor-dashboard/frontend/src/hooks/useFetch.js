import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

export function useFetch(path, interval = 0) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(() => {
    setLoading(true);
    api.get(path)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    refetch();
    // Something changed through the chat assistant (a trade, alert, watchlist entry): reload
    window.addEventListener('assetadvisor:data-changed', refetch);
    const id = interval > 0 ? setInterval(refetch, interval) : null;
    return () => {
      window.removeEventListener('assetadvisor:data-changed', refetch);
      if (id) clearInterval(id);
    };
  }, [refetch, interval]);

  return { data, loading, error, refetch };
}
