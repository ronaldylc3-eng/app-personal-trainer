import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, UserPlus, Mail, Phone, CreditCard,
  X, Check, AlertCircle, Loader2, UserCheck,
  Clock, Dumbbell, Trash2, Shield, FolderOpen,
  LayoutDashboard, User
} from 'lucide-react';
import { usuarios, auth } from '../../services/api';
import ResumoCompletoModal from './ResumoCompletoModal';
import type { Usuario } from '../../types';

export default function Alunos() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [alunos, setAlunos] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resumoAluno, setResumoAluno] = useState<Usuario | null>(null);

  const loadAlunos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await usuarios.getClientes();
      setAlunos(data);
    } catch (e) {
      console.error('[Alunos] Falha ao carregar alunos:', e);
      setError('Falha ao carregar alunos. Verifique sua conexao.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlunos(); }, [loadAlunos]);

  const filteredAlunos = alunos.filter(a =>
    a.nome.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  );

  const pendentes = filteredAlunos.filter(a => a.status === 'pendente');
  const ativos = filteredAlunos.filter(a => a.status === 'ativo');
  const inativos = filteredAlunos.filter(a => a.status === 'inativo');

  async function handleExcluir(aluno: Usuario) {
    if (!confirm(`Excluir ${aluno.nome} permanentemente? Esta acao nao pode ser desfeita.`)) return;
    if (!confirm('Tem certeza? O aluno perdera todos os dados.')) return;
    await usuarios.delete(aluno.id);
    loadAlunos();
  }

  return (
    <div className="min-h-screen p-4 md:p-7 pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Cabecalho da pagina */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
          <div className="flex items-start gap-3.5">
            <div className="w-[46px] h-[46px] flex-none bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel">
              <Users size={22} className="text-[#170B04]" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="font-display uppercase text-[26px] leading-tight text-bone">Alunos</h1>
              <p className="text-[13.5px] text-muted-steel">Convide e gerencie seus clientes.</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn-forge-sm"
          >
            <UserPlus size={16} />
            Cadastrar Aluno
          </button>
        </div>

        {/* Busca */}
        <div className="field-bevel max-w-xl">
          <Search size={16} className="ml-3.5 shrink-0 text-muted-steel pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar aluno por nome ou email..."
            className="!py-3"
          />
        </div>

        {showForm && (
          <FormularioCadastro
            onCreated={() => { setShowForm(false); loadAlunos(); }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-300 border border-red-500/20 clip-bevel-sm">
            <AlertCircle size={14} className="shrink-0" />
            <p className="text-xs flex-1">{error}</p>
            <button
              onClick={loadAlunos}
              className="px-3 py-1.5 bg-panel-2 hover:bg-panel text-bone text-[11px] font-semibold border border-line clip-bevel-sm transition-colors duration-150 shrink-0"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {loading ? (
          <div className="bg-panel border border-line p-8 text-center">
            <Loader2 size={22} className="mx-auto text-muted-steel animate-spin" />
            <p className="text-xs text-muted-steel mt-3">Carregando alunos...</p>
          </div>
        ) : filteredAlunos.length === 0 ? (
          <div className="bg-panel border border-line p-8 md:p-12 text-center">
            <Users size={36} className="text-[#4A4A50] mx-auto mb-4" />
            <p className="text-zinc-400 text-xs md:text-sm font-medium">
              {search ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}
            </p>
            <p className="text-[#6C6C74] text-xs mt-1">
              {!search && 'Clique em "Cadastrar Aluno" para convidar o primeiro aluno'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {pendentes.length > 0 && (
              <section>
                <p className="font-display text-[12.5px] tracking-[0.12em] uppercase flex items-center gap-2 mb-1 text-amber-400">
                  <Clock size={13} /> Aguardando Senha ({pendentes.length})
                </p>
                <p className="text-[11px] text-muted-steel mb-3">
                  Estes alunos receberam o convite e ainda nao definiram a senha.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendentes.map(aluno => (
                    <AlunoCard key={aluno.id} aluno={aluno} onExcluir={() => handleExcluir(aluno)} />
                  ))}
                </div>
              </section>
            )}

            {ativos.length > 0 && (
              <section>
                <p className="font-display text-[12.5px] tracking-[0.12em] uppercase flex items-center gap-2 mb-3 text-ok">
                  <UserCheck size={13} /> Ativos ({ativos.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ativos.map(aluno => (
                    <AlunoCard
                      key={aluno.id}
                      aluno={aluno}
                      onExcluir={() => handleExcluir(aluno)}
                      onResumo={() => setResumoAluno(aluno)}
                    />
                  ))}
                </div>
              </section>
            )}

            {inativos.length > 0 && (
              <section>
                <p className="font-display text-[12.5px] tracking-[0.12em] uppercase flex items-center gap-2 mb-3 text-muted-steel">
                  <AlertCircle size={13} /> Inativos ({inativos.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inativos.map(aluno => (
                    <AlunoCard key={aluno.id} aluno={aluno} onExcluir={() => handleExcluir(aluno)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Modal: resumo completo do aluno */}
      {resumoAluno && (
        <ResumoCompletoModal aluno={resumoAluno} onClose={() => setResumoAluno(null)} />
      )}
    </div>
  );
}

function AlunoCard({ aluno, onExcluir, onResumo }: {
  aluno: Usuario;
  onExcluir?: () => void;
  onResumo?: () => void;
}) {
  const navigate = useNavigate();
  const isPendente = aluno.status === 'pendente';
  const isInativo = aluno.status === 'inativo';
  const pacoteLabel = aluno.pacote === 'VIP' ? 'VIP' : 'Premium';

  return (
    <div className={`bg-panel border p-4 md:p-5 transition-all ${
      isPendente ? 'border-amber-500/30' : isInativo ? 'border-line opacity-60' : 'border-line'
    }`}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 flex-none flex items-center justify-center border text-sm font-bold ${
            isPendente
              ? 'clip-bevel-sm bg-amber-500/10 border-amber-500/30 text-amber-400'
              : isInativo
              ? 'clip-bevel-sm bg-panel-2 border-line text-muted-steel'
              : 'clip-bevel-sm bg-gradient-to-br from-accent-light to-plate border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] text-[#170B04]'
          }`}>
            {aluno.nome.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-bone truncate">{aluno.nome}</h3>
            <p className="text-[11px] text-muted-steel flex items-center gap-1 truncate">
              <Mail size={9} /> {aluno.email}
            </p>
          </div>
        </div>
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 border clip-bevel-sm ${
          isPendente
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            : isInativo
            ? 'bg-panel-2 text-muted-steel border-line'
            : 'bg-ok/10 text-ok border-ok/30'
        }`}>
          {isPendente ? 'Aguardando' : isInativo ? 'Inativo' : 'Ativo'}
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        {aluno.telefone && (
          <div className="flex items-center gap-2 text-[11px] text-muted-steel">
            <Phone size={10} />
            <span>{aluno.telefone}</span>
          </div>
        )}
        {aluno.cpf && (
          <div className="flex items-center gap-2 text-[11px] text-muted-steel">
            <CreditCard size={10} />
            <span>{aluno.cpf}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-muted-steel">
          <Dumbbell size={10} />
          <span>Pacote: <span className="text-accent-light font-medium">{pacoteLabel}</span></span>
        </div>
      </div>

      <div className="pt-3 border-t border-line flex gap-2">
        <button
          onClick={() => navigate(`/alunos/${aluno.id}`)}
          className="btn-forge-sm flex-1 !h-[40px] px-3 text-[12.5px]"
        >
          <FolderOpen size={13} /> Prontuário
        </button>
        {aluno.status === 'ativo' && onResumo && (
          <button
            onClick={onResumo}
            className="btn-steel-sm flex-1 !h-[40px] px-3 text-[12.5px]"
            title="Ver resumo completo do aluno"
          >
            <LayoutDashboard size={13} /> Resumo
          </button>
        )}
        {onExcluir && (
          <button
            onClick={onExcluir}
            className="flex items-center justify-center px-3 bg-red-500/5 hover:bg-red-500/15 text-red-400/80 border border-red-500/20 clip-bevel-sm transition-colors duration-150"
            title="Excluir aluno"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function FormularioCadastro({ onCreated, onCancel }: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [pacote, setPacote] = useState<'Premium' | 'VIP'>('Premium');
  const [genero, setGenero] = useState<'masculino' | 'feminino' | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!nome.trim()) { setError('O nome é obrigatório.'); return; }
    if (!email.trim() || !email.includes('@')) { setError('Informe um e-mail válido.'); return; }
    if (!genero) { setError('Selecione o sexo do aluno.'); return; }

    setLoading(true);
    try {
      await usuarios.inviteAluno({
        email: email.trim(),
        nome: nome.trim(),
        telefone,
        cpf,
        pacote,
        genero: genero as 'masculino' | 'feminino',
        frontendUrl: window.location.origin,
      });

      setSuccess(`Aluno ${nome.trim()} cadastrado com sucesso no Firebase!`);
      setTimeout(() => onCreated(), 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao cadastrar aluno';
      if (message.includes('already') || message.includes('já está')) {
        setError('Este e-mail já está cadastrado.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-panel border border-line clip-bevel p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <p className="font-display text-[12.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
          <UserPlus size={14} className="text-accent-light" />
          Cadastrar Aluno
        </p>
        <button onClick={onCancel} className="text-muted-steel hover:text-bone transition-colors" aria-label="Fechar formulário">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium">Nome completo *</label>
            <div className="field-bevel">
              <input
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Nome do aluno"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium flex items-center gap-1.5">
              <Mail size={12} className="text-muted-steel" /> E-mail *
            </label>
            <div className="field-bevel">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="aluno@email.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium flex items-center gap-1.5">
              <Phone size={12} className="text-muted-steel" /> Telefone
            </label>
            <div className="field-bevel">
              <input
                value={telefone}
                onChange={e => setTelefone(formatTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={16}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium flex items-center gap-1.5">
              <CreditCard size={12} className="text-muted-steel" /> CPF
            </label>
            <div className="field-bevel">
              <input
                value={cpf}
                onChange={e => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium flex items-center gap-1.5">
              <Dumbbell size={12} className="text-muted-steel" /> Pacote
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPacote('Premium')}
                className={`tab-chip flex-1 ${pacote === 'Premium' ? '!text-accent-light !border-accent' : ''}`}
              >
                <Dumbbell size={13} />
                Premium
              </button>
              <button
                type="button"
                onClick={() => setPacote('VIP')}
                className={`tab-chip flex-1 ${pacote === 'VIP' ? '!text-accent-light !border-accent' : ''}`}
              >
                <Shield size={13} />
                VIP
              </button>
            </div>
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[11px] md:text-[12px] text-zinc-300 font-medium flex items-center gap-1.5">
              <User size={12} className="text-muted-steel" /> Sexo *
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
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 clip-bevel-sm text-red-300 text-xs">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-ok/10 border border-ok/30 clip-bevel-sm text-ok text-xs">
            <Check size={14} /> {success}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="btn-forge sm:flex-1"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
            {loading ? 'Enviando Convite...' : 'Enviar Convite'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-steel sm:flex-1"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
