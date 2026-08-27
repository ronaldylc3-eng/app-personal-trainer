import { Clock, LogOut, Dumbbell, ShieldAlert, Ban } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function AguardandoAprovacao() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const isRecusado = profile?.status === 'inativo';

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4 shadow-glow-sm">
            <Dumbbell size={26} className="text-accent" strokeWidth={1.8} />
          </div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight">FitnessApp</h1>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-2xl p-5 md:p-6 text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${
            isRecusado
              ? 'bg-red-500/10 border border-red-500/20'
              : 'bg-yellow-500/10 border border-yellow-500/20'
          }`}>
            {isRecusado ? (
              <Ban size={28} className="text-red-400" />
            ) : (
              <Clock size={28} className="text-yellow-400" />
            )}
          </div>

          <h2 className="text-base font-bold text-zinc-100 mb-2">
            {isRecusado ? 'Acesso Recusado' : 'Aguardando Confirmacao'}
          </h2>

          <p className="text-[12px] text-zinc-400 leading-relaxed mb-4">
            {isRecusado
              ? 'Seu acesso foi recusado pelo Personal Trainer.'
              : 'Seu acesso ainda nao foi autorizado.'
            }
          </p>

          <div className="bg-zinc-950/60 border border-zinc-800/30 rounded-xl p-3.5 mb-5 space-y-2">
            {isRecusado ? (
              <>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Aguardando confirmacao do Personal Trainer.
                </p>
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  Voce nao pode acessar treinos, dietas ou outras funcionalidades.
                </p>
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  Apos 15 minutos, voce podera tentar fazer login novamente.
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Aguardando confirmacao do Personal Trainer.
                </p>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-600">
                  <ShieldAlert size={11} />
                  <span>Voce nao pode acessar treinos, dietas ou outras funcionalidades.</span>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[13px] font-semibold rounded-xl px-4 py-2.5 min-h-[44px] transition-all duration-150 border border-zinc-700"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>

        <p className="text-center mt-5 text-[11px] text-zinc-600">
          Duvidas? Entre em contato com seu personal.
        </p>
      </div>
    </div>
  );
}
