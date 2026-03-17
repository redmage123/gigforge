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
    if (interval > 0) {
      const id = setInterval(refetch, interval);
      return () => clearInterval(id);
    }
  }, [refetch, interval]);

  return { data, loading, error, refetch };
}
