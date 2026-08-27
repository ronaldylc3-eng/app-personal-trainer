import { useState, useEffect, useCallback } from 'react';
import { usuarios } from '../services/api';
import type { Usuario } from '../types';

export function useAlunos() {
  const [alunos, setAlunos] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAlunos = useCallback(async () => {
    try {
      setLoading(true);
      const data = await usuarios.getClientes();
      setAlunos(data);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlunos();
  }, [fetchAlunos]);

  return { alunos, loading, error, refetch: fetchAlunos };
}