import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ── Perímetros ──
export interface Perimetros {
  braco_direito: number;
  braco_esquerdo: number;
  antebraco_direito: number;
  antebraco_esquerdo: number;
  peitoral: number;
  cintura: number;
  abdomen: number;
  quadril: number;
  coxa_direita: number;
  coxa_esquerda: number;
  panturrilha_direita: number;
  panturrilha_esquerda: number;
}

// ── Composição Corporal ──
export interface ComposicaoCorporal {
  percentual_gordura: number;
  massa_magra: number;
  massa_gordura: number;
}

// ── Avaliação Física ──
export interface AvaliacaoData {
  anamnese: string;
  perimetros: Perimetros;
  composicao: ComposicaoCorporal;
  flexibilidade_forca: string;
  objetivo: string;
}

// ── Estratégia Calórica ──
export interface EstrategiaCalorica {
  estrategia: 'superavit' | 'deficit';
  ajuste_calorias: number;
  idade: number;
  sexo: 'M' | 'F';
  nivelAtividade: string;
}

// ── Estado completo por aluno ──
interface StudentFullData {
  peso: number;
  altura: number;
  avaliacao: AvaliacaoData;
  estrategia: EstrategiaCalorica;
}

// ── Defaults ──
const DEFAULT_PERIMETROS: Perimetros = {
  braco_direito: 0, braco_esquerdo: 0,
  antebraco_direito: 0, antebraco_esquerdo: 0,
  peitoral: 0, cintura: 0, abdomen: 0, quadril: 0,
  coxa_direita: 0, coxa_esquerda: 0,
  panturrilha_direita: 0, panturrilha_esquerda: 0,
};

const DEFAULT_AVALIACAO: AvaliacaoData = {
  anamnese: '',
  perimetros: { ...DEFAULT_PERIMETROS },
  composicao: { percentual_gordura: 0, massa_magra: 0, massa_gordura: 0 },
  flexibilidade_forca: '',
  objetivo: '',
};

const DEFAULT_ESTRATEGIA: EstrategiaCalorica = {
  estrategia: 'superavit',
  ajuste_calorias: 0,
  idade: 0,
  sexo: 'M',
  nivelAtividade: 'sedentario',
};

// ── Context ──
interface StudentDataContextType {
  students: Record<string, StudentFullData>;
  // Peso / Altura
  setPeso: (id: string, v: number) => void;
  setAltura: (id: string, v: number) => void;
  getPeso: (id: string) => number;
  getAltura: (id: string) => number;
  // Avaliação
  getAvaliacao: (id: string) => AvaliacaoData;
  setAvaliacao: (id: string, data: AvaliacaoData) => void;
  // Estratégia
  getEstrategia: (id: string) => EstrategiaCalorica;
  setEstrategia: (id: string, data: EstrategiaCalorica) => void;
}

const StudentDataContext = createContext<StudentDataContextType | null>(null);

function getStudent(prev: Record<string, StudentFullData>, id: string): StudentFullData {
  return prev[id] || { peso: 0, altura: 0, avaliacao: { ...DEFAULT_AVALIACAO }, estrategia: { ...DEFAULT_ESTRATEGIA } };
}

export function StudentDataProvider({ children }: { children: ReactNode }) {
  const [students, setStudents] = useState<Record<string, StudentFullData>>({});

  const setPeso = useCallback((id: string, peso: number) => {
    setStudents(prev => ({ ...prev, [id]: { ...getStudent(prev, id), peso } }));
  }, []);

  const setAltura = useCallback((id: string, altura: number) => {
    setStudents(prev => ({ ...prev, [id]: { ...getStudent(prev, id), altura } }));
  }, []);

  const getPeso = useCallback((id: string) => students[id]?.peso || 0, [students]);
  const getAltura = useCallback((id: string) => students[id]?.altura || 0, [students]);

  const getAvaliacao = useCallback((id: string) => students[id]?.avaliacao || { ...DEFAULT_AVALIACAO }, [students]);
  const setAvaliacao = useCallback((id: string, data: AvaliacaoData) => {
    setStudents(prev => ({ ...prev, [id]: { ...getStudent(prev, id), avaliacao: data } }));
  }, []);

  const getEstrategia = useCallback((id: string) => students[id]?.estrategia || { ...DEFAULT_ESTRATEGIA }, [students]);
  const setEstrategia = useCallback((id: string, data: EstrategiaCalorica) => {
    setStudents(prev => ({ ...prev, [id]: { ...getStudent(prev, id), estrategia: data } }));
  }, []);

  return (
    <StudentDataContext.Provider value={{
      students, setPeso, setAltura, getPeso, getAltura,
      getAvaliacao, setAvaliacao, getEstrategia, setEstrategia,
    }}>
      {children}
    </StudentDataContext.Provider>
  );
}

export function useStudentData() {
  const ctx = useContext(StudentDataContext);
  if (!ctx) throw new Error('useStudentData must be used within StudentDataProvider');
  return ctx;
}
