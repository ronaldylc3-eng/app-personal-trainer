import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Loader2, AlertCircle, Settings2, MessageSquare, ClipboardCheck, BarChart3, CalendarRange } from 'lucide-react';
import StudentAvatar from '../ui/StudentAvatar';
import { usuarios } from '../../services/api';
import ModalEditarAluno from './ModalEditarAluno';
import { BarraOlimpicaIcon, TalherFolhaIcon } from '../icons/AppIcons';
import type { Usuario } from '../../types';

interface AlunoLayoutContext {
  aluno: Usuario | null;
}

const TABS = [
  { to: '', label: 'Visão Geral', icon: LayoutDashboard, end: true },
  { to: 'treino', label: 'Treino', icon: BarraOlimpicaIcon, end: false },
  { to: 'planejamento', label: 'Planejamento', icon: CalendarRange, end: false },
  { to: 'progresso', label: 'Progressão', icon: BarChart3, end: false },
  { to: 'dieta', label: 'Dieta', icon: TalherFolhaIcon, end: false },
  { to: 'acompanhamento', label: 'Acompanhamento', icon: MessageSquare, end: false },
  { to: 'avaliacao', label: 'Avaliação Física', icon: ClipboardCheck, end: false },
];

export function useAlunoContext() {
  return useOutletContext<AlunoLayoutContext>();
}

export default function AlunoLayout() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const navigate = useNavigate();
  const [aluno, setAluno] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalEdicao, setModalEdicao] = useState(false);

  useEffect(() => {
    if (!alunoId) return;
    let cancel = false;
    setLoading(true);
    setError('');
    usuarios.getById(alunoId)
      .then(a => {
        if (cancel) return;
        setAluno(a);
        setLoading(false);
      })
      .catch(() => {
        if (cancel) return;
        setError('Falha ao carregar dados do aluno.');
        setLoading(false);
      });
    return () => { cancel = true; };
  }, [alunoId]);

  const initials = aluno?.nome
    ? aluno.nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
    : '?';

  return (
    <div className="min-h-screen">
      {/* Topbar dedicada ao aluno */}
      <div className="sticky top-0 z-20 bg-[#101012]/95 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-10">
          <div className="flex items-center gap-3 py-3">
            <button
              onClick={() => navigate('/alunos')}
              className="p-2 -ml-2 text-muted-steel hover:text-bone hover:bg-panel-2 clip-bevel-sm transition-colors duration-150"
              title="Voltar para Alunos"
            >
              <ArrowLeft size={18} />
            </button>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-steel">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-xs">Carregando aluno...</span>
              </div>
            ) : error || !aluno ? (
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle size={16} />
                <span className="text-xs">{error || 'Aluno não encontrado'}</span>
              </div>
            ) : (
              <>
                <StudentAvatar size="sm" />
                <div className="min-w-0 flex-1">
                  <h1 className="text-sm font-bold text-bone truncate leading-tight">{aluno.nome}</h1>
                  <p className="text-[11px] text-muted-steel truncate leading-tight">{aluno.email}</p>
                </div>
                <span className={`shrink-0 hidden md:inline-block text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 border clip-bevel-sm ${
                  aluno.pacote === 'VIP'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-panel-2 text-muted-steel border-line'
                }`}>
                  {aluno.pacote === 'VIP' ? 'VIP' : 'Premium'}
                </span>
                <span className={`shrink-0 hidden sm:inline-block text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 border clip-bevel-sm ${
                  aluno.status === 'ativo'
                    ? 'bg-ok/10 text-ok border-ok/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  {aluno.status === 'ativo' ? 'Ativo' : 'Pendente'}
                </span>
                <button
                  onClick={() => setModalEdicao(true)}
                  title="Editar dados cadastrais e pacote"
                  className="btn-forge-sm shrink-0 !h-[40px] px-3.5 text-[12.5px]"
                >
                  <Settings2 size={13} />
                  <span className="hidden sm:inline">Editar Aluno</span>
                </button>
              </>
            )}
          </div>

          {/* Tabs do prontuário */}
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {TABS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 md:px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-all duration-150 ${
                    isActive
                      ? 'text-accent-light border-plate'
                      : 'text-muted-steel border-transparent hover:text-zinc-300 hover:border-line'
                  }`
                }
              >
                <Icon size={14} strokeWidth={1.8} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Conteúdo da aba */}
      <Outlet context={{ aluno } satisfies AlunoLayoutContext} />

      {/* Modal: editar dados cadastrais e pacote */}
      {modalEdicao && aluno && (
        <ModalEditarAluno
          aluno={aluno}
          onClose={() => setModalEdicao(false)}
          onSaved={atualizado => {
            setAluno(atualizado);
            setModalEdicao(false);
          }}
        />
      )}
    </div>
  );
}
