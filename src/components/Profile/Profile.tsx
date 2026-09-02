import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { User, Mail, Phone, CreditCard, Dumbbell, Shield, Check, AlertCircle, Loader2 } from 'lucide-react';
import StudentAvatar from '../ui/StudentAvatar';
import { useAuth } from '../../hooks/useAuth';
import { usuarios } from '../../services/api';

export default function Profile() {
  const { profile, isAdmin } = useAuth();

  if (isAdmin) return <Navigate to="/alunos" replace />;
  if (!profile) return null;

  return <EditarPerfil perfil={profile} />;
}

function EditarPerfil({ perfil }: { perfil: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const [nome, setNome] = useState(perfil.nome || '');
  const [telefone, setTelefone] = useState(perfil.telefone || '');
  const [cpf, setCpf] = useState(perfil.cpf || '');
  const [genero, setGenero] = useState<'masculino' | 'feminino' | ''>(perfil.genero || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  function formatTelefone(v: string): string {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function formatCpf(v: string): string {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setSucesso('');
    if (!nome.trim()) { setErro('O nome é obrigatório.'); return; }

    setSalvando(true);
    try {
      const dados: { nome: string; telefone?: string; cpf?: string; genero?: 'masculino' | 'feminino' } = {
        nome: nome.trim(),
        telefone: (telefone || '').replace(/\D/g, ''),
        cpf: (cpf || '').replace(/\D/g, ''),
      };
      if (genero === 'masculino' || genero === 'feminino') dados.genero = genero;
      await usuarios.updatePerfil(perfil.id, dados);
      setSucesso('Perfil atualizado com sucesso!');
    } catch (err) {
      console.error('[Profile] Falha ao salvar perfil:', err);
      setErro('Falha ao salvar o perfil. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  const pacoteLabel = perfil.pacote === 'VIP' ? 'VIP' : 'Premium';

  return (
    <div className="min-h-screen p-4 md:p-7 pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start gap-3.5 mb-2">
          <StudentAvatar size="lg" />
          <div>
            <h1 className="font-display uppercase text-[26px] leading-tight text-bone">Meu Perfil</h1>
            <p className="text-[13.5px] text-muted-steel">Atualize seus dados cadastrais.</p>
          </div>
        </div>

        <form onSubmit={handleSalvar} className="bg-panel border border-line clip-bevel p-4 md:p-6 space-y-5">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-steel">
            <span className="flex items-center gap-1.5">
              <Mail size={13} /> {perfil.email}
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 border clip-bevel-sm bg-ok/10 text-ok border-ok/30 font-bold uppercase tracking-[0.06em]">
              <Shield size={11} /> {pacoteLabel}
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium">Nome completo *</label>
            <div className="field-bevel">
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium flex items-center gap-1.5">
                <Phone size={12} className="text-muted-steel" /> Telefone
              </label>
              <div className="field-bevel">
                <input value={telefone} onChange={e => setTelefone(formatTelefone(e.target.value))} placeholder="(00) 00000-0000" maxLength={16} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium flex items-center gap-1.5">
                <CreditCard size={12} className="text-muted-steel" /> CPF
              </label>
              <div className="field-bevel">
                <input value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" maxLength={14} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium flex items-center gap-1.5">
              <User size={12} className="text-muted-steel" /> Sexo
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGenero('masculino')}
                className={`tab-chip flex-1 ${genero === 'masculino' ? '!text-accent-light !border-accent' : ''}`}
              >
                Masculino
              </button>
              <button
                type="button"
                onClick={() => setGenero('feminino')}
                className={`tab-chip flex-1 ${genero === 'feminino' ? '!text-accent-light !border-accent' : ''}`}
              >
                Feminino
              </button>
            </div>
          </div>

          {erro && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 clip-bevel-sm text-red-300 text-xs">
              <AlertCircle size={14} /> {erro}
            </div>
          )}
          {sucesso && (
            <div className="flex items-center gap-2 p-3 bg-ok/10 border border-ok/30 clip-bevel-sm text-ok text-xs">
              <Check size={14} /> {sucesso}
            </div>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="btn-forge w-full"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </form>

        <p className="text-[11px] text-muted-steel flex items-center gap-1.5">
          <Dumbbell size={11} /> O e-mail, o pacote e o plano são gerenciados pelo seu treinador.
        </p>
      </div>
    </div>
  );
}
