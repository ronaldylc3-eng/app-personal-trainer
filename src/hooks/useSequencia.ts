import { useEffect, useState } from 'react';
import { logsTreino } from '../services/api';
import { calcularConsistencia, type Consistencia } from '../utils/consistencia';
import type { SessaoHistorico } from '../types';

const VAZIO = () => calcularConsistencia([] as SessaoHistorico[]);

export function useSequencia(userId?: string): Consistencia & { loading: boolean; sessoes: SessaoHistorico[] } {
  const [info, setInfo] = useState<Consistencia>(VAZIO);
  const [sessoes, setSessoes] = useState<SessaoHistorico[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancel = false;
    setLoading(true);
    logsTreino.getByCliente(userId)
      .then(s => {
        if (cancel) return;
        setSessoes(s);
        setInfo(calcularConsistencia(s));
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [userId]);

  return { ...info, loading, sessoes };
}
