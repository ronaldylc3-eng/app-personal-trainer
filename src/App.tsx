import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Lock, Dumbbell } from 'lucide-react';
import { StudentDataProvider } from './contexts/StudentDataContext';
import { useAuth } from './hooks/useAuth';
import Login from './components/Auth/Login';
import DefinirSenha from './components/Auth/DefinirSenha';
import NovaSenha from './components/Auth/NovaSenha';
import RecuperarSenha from './components/Auth/RecuperarSenha';
import Sidebar, { BottomNav } from './components/Sidebar';
import TopHeader from './components/TopHeader';
import Inicio from './components/Inicio/Inicio';
import Profile from './components/Profile/Profile';
import Workouts from './components/Workouts/Workouts';
import Diet from './components/Diet/Diet';
import Alunos from './components/Alunos/Alunos';
import Relatorios from './components/Relatorios/Relatorios';
import DashboardGestor from './components/DashboardGestor/DashboardGestor';
import AlunoLayout from './components/Prontuario/AlunoLayout';
import ProntuarioAluno from './components/Prontuario/ProntuarioAluno';
import ProntuarioAcompanhamento from './components/Prontuario/ProntuarioAcompanhamento';
import ProntuarioAvaliacaoFisica from './components/Prontuario/ProntuarioAvaliacaoFisica';
import ProntuarioProgressao from './components/Prontuario/ProntuarioProgressao';
import PlanejamentoSemanal from './components/Prontuario/PlanejamentoSemanal';
import Progressao from './components/Progressao/Progressao';
import PWAInstallBanner from './components/PWAInstallBanner';

// Wrappers: injetam o alunoId da rota nas telas de treino/dieta
function WorkoutsDoAluno() {
  const { alunoId } = useParams<{ alunoId: string }>();
  return <Workouts alunoId={alunoId} />;
}

function DietDoAluno() {
  const { alunoId } = useParams<{ alunoId: string }>();
  return <Diet alunoId={alunoId} />;
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-10 flex items-center justify-center">
      <div className="bg-panel border border-line clip-bevel p-8 md:p-12 text-center max-w-md w-full">
        <div className="w-[46px] h-[46px] mx-auto mb-5 bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel">
          <Dumbbell size={22} className="text-[#170B04]" strokeWidth={2.4} />
        </div>
        <h2 className="font-display uppercase text-[22px] text-bone mb-2">{title}</h2>
        <p className="text-sm text-muted-steel">Esta funcionalidade será implementada nas próximas fases.</p>
      </div>
    </div>
  );
}

function VipOnly() {
  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-10 flex items-center justify-center">
      <div className="bg-panel border border-line clip-bevel p-8 md:p-12 text-center max-w-md w-full">
        <div className="w-[46px] h-[46px] mx-auto mb-5 bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] clip-bevel">
          <Lock size={22} className="text-[#170B04]" strokeWidth={2.4} />
        </div>
        <h2 className="font-display uppercase text-[22px] text-bone mb-2">Conteúdo exclusivo VIP</h2>
        <p className="text-sm text-muted-steel">Faça upgrade do seu plano para acessar este conteúdo.</p>
      </div>
    </div>
  );
}

// Guard de rota: conteudo exclusivo do gestor. Exibe aviso e redireciona para /inicio.
function AreaRestrita() {
  const [redirecionar, setRedirecionar] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRedirecionar(true), 3000);
    return () => clearTimeout(t);
  }, []);

  if (redirecionar) return <Navigate to="/inicio" replace />;

  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-10 flex items-center justify-center">
      <div className="bg-panel border border-line clip-bevel p-8 md:p-12 text-center max-w-md w-full">
        <div className="w-[46px] h-[46px] mx-auto mb-5 bg-gradient-to-br from-red-400 to-red-800 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] clip-bevel">
          <Lock size={22} className="text-[#170B04]" strokeWidth={2.4} />
        </div>
        <h2 className="font-display uppercase text-[22px] text-bone mb-2">Área restrita</h2>
        <p className="text-sm text-muted-steel mb-6">Este conteúdo é exclusivo do gestor.</p>
        <button
          onClick={() => setRedirecionar(true)}
          className="btn-forge"
        >
          Voltar ao início
        </button>
      </div>
    </div>
  );
}

const AUTH_PATHS = ['/definir-senha', '/nova-senha', '/recuperar-senha'];

function AuthScreenRoutes() {
  return (
    <Routes>
      <Route path="/definir-senha" element={<DefinirSenha />} />
      <Route path="/nova-senha" element={<NovaSenha />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
    </Routes>
  );
}

function AppContent() {
  const { user, profile, loading, isAdmin, isPremium, isVIP } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pathname = location.pathname;
  const isAuthScreen =
    AUTH_PATHS.includes(pathname) || window.location.hash.includes('access_token');

  if (loading) {
    if (isAuthScreen) return <AuthScreenRoutes />;
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <span className="text-[12px] text-zinc-500 font-medium">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    if (isAuthScreen) return <AuthScreenRoutes />;
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (!profile) {
    if (isAuthScreen) return <AuthScreenRoutes />;
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <span className="text-[12px] text-zinc-500 font-medium">Verificando acesso...</span>
        </div>
      </div>
    );
  }

  if (isAuthScreen) return <AuthScreenRoutes />;

  if (isAdmin) {
    return (
      <div className="flex h-screen bg-zinc-950 overflow-hidden">
        <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} isVIP={true} isAdmin={true} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopHeader onMenuClick={() => setMobileMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
            <Routes>
              <Route path="/" element={<DashboardGestor />} />
              <Route path="/inicio" element={<DashboardGestor />} />
              {/* Abas legadas do gestor: consolidadas no Prontuario (via /alunos) */}
              <Route path="/perfil" element={<Navigate to="/alunos" replace />} />
              <Route path="/avaliacao" element={<Navigate to="/alunos" replace />} />
              <Route path="/treinos" element={<Navigate to="/alunos" replace />} />
              <Route path="/dieta" element={<Navigate to="/alunos" replace />} />
              <Route path="/alunos" element={<Alunos />} />
              <Route path="/alunos/:alunoId" element={<AlunoLayout />}>
                <Route index element={<ProntuarioAluno />} />
                <Route path="treino" element={<WorkoutsDoAluno />} />
                <Route path="planejamento" element={<PlanejamentoSemanal />} />
                <Route path="progresso" element={<ProntuarioProgressao />} />
                <Route path="dieta" element={<DietDoAluno />} />
                <Route path="acompanhamento" element={<ProntuarioAcompanhamento />} />
                <Route path="avaliacao" element={<ProntuarioAvaliacaoFisica />} />
              </Route>
              <Route path="/progresso" element={<Placeholder title="Progresso" />} />
              <Route path="/relatorios" element={<Relatorios />} />
            </Routes>
          </main>
        </div>
        <BottomNav isVIP={true} isAdmin={true} />
      </div>
    );
  }

  if (profile.status !== 'ativo') {
    if (isAuthScreen) return <AuthScreenRoutes />;
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} isVIP={isVIP} isAdmin={false} isPremium={isPremium} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopHeader onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
            <Routes>
              <Route path="/" element={<Navigate to="/inicio" replace />} />
              <Route path="/inicio" element={<Inicio />} />
              {!isPremium && <Route path="/perfil" element={<Profile />} />}
              <Route path="/treinos" element={<Workouts />} />
              <Route path="/avaliacao" element={<AreaRestrita />} />
              <Route path="/dieta" element={isVIP ? <Diet /> : <VipOnly />} />
              <Route path="/progresso" element={<Progressao />} />
              <Route path="/relatorios" element={<AreaRestrita />} />
              <Route path="*" element={<Navigate to="/inicio" replace />} />
            </Routes>
        </main>
      </div>
      <BottomNav isVIP={isVIP} isAdmin={false} isPremium={isPremium} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <StudentDataProvider>
        <PWAInstallBanner />
        <AppContent />
      </StudentDataProvider>
    </BrowserRouter>
  );
}
