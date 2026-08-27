import { useState } from 'react';
import { X, Check, Loader2, AlertCircle } from 'lucide-react';
import { usuarios } from '../../services/api';
import type { Usuario, Genero } from '../../types';

function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

function mascaraTelefone(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function mascaraCPF(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

interface ModalEditarAlunoProps {
  aluno: Usuario;
  onClose: () => void;
  onSaved: (atualizado: Usuario) => void;
}

export default function ModalEditarAluno({ aluno, onClose, onSaved }: ModalEditarAlunoProps) {
  const [nome, setNome] = useState(aluno.nome || '');
  const [telefone, setTelefone] = useState(mascaraTelefone(aluno.telefone || ''));
  const [cpf, setCpf] = useState(mascaraCPF(aluno.cpf || ''));
  const [pacote, setPacote] = useState<'Premium' | 'VIP'>(aluno.pacote ?? 'Premium');
  const [genero, setGenero] = useState<'' | Genero>(aluno.genero ?? '');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  async function handleSalvar() {
    if (!nome.trim()) {
      setErro('O nome do aluno é obrigatório.');
      return;
    }
    if (!genero) {
      setErro('Selecione o sexo do aluno (usado nas estatísticas de treino).');
      return;
    }
    setSaving(true);
    setErro('');
    try {
      const atualizado = await usuarios.updatePerfil(aluno.id, {
        nome,
        telefone,
        cpf,
        pacote,
        genero,
      });
      onSaved(atualizado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar os dados do aluno.');
    } finally {
      setSaving(false);
    }
  }

  const pacoteOptions: { valor: 'Premium' | 'VIP'; titulo: string; descricao: string }[] = [
    { valor: 'Premium', titulo: 'Premium', descricao: 'Apenas Treino' },
    { valor: 'VIP', titulo: 'VIP', descricao: 'Treino + Dieta + Acompanhamento' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-panel border border-line clip-bevel p-5 md:p-6 max-w-md w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="font-display text-[12.5px] tracking-[0.12em] uppercase text-bone">Editar Dados Cadastrais</p>
          <button onClick={onClose} disabled={saving} className="text-muted-steel hover:text-bone transition-colors disabled:opacity-40" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Erro */}
        {erro && (
          <div className="flex items-center gap-2 clip-bevel-sm px-3.5 py-2.5 text-xs bg-red-500/10 text-red-300 border border-red-500/20">
            <AlertCircle size={13} className="shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold block mb-1.5">Nome</label>
            <div className="field-bevel">
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Nome do aluno"
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold block mb-1.5">Telefone</label>
              <div className="field-bevel">
                <input
                  type="text"
                  inputMode="numeric"
                  value={telefone}
                  onChange={e => setTelefone(mascaraTelefone(e.target.value))}
                  placeholder="(48) 99999-9999"
                  maxLength={15}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold block mb-1.5">CPF</label>
              <div className="field-bevel">
                <input
                  type="text"
                  inputMode="numeric"
                  value={cpf}
                  onChange={e => setCpf(mascaraCPF(e.target.value))}
                  placeholder="123.456.789-00"
                  maxLength={14}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold block mb-1.5">Sexo *</label>
            <div className="flex gap-2">
              {(['masculino', 'feminino'] as Genero[]).map(g => {
                const selecionado = genero === g;
                const label = g === 'masculino' ? 'Masculino' : 'Feminino';
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenero(g)}
                    disabled={saving}
                    className={`flex-1 border p-3 text-center transition-all duration-150 disabled:opacity-60 clip-bevel-sm ${
                      selecionado
                        ? 'bg-accent/10 border-accent'
                        : 'bg-panel-2 border-line hover:border-[#3A3A40]'
                    }`}
                  >
                    <p className={`text-sm font-bold ${selecionado ? 'text-accent-light' : 'text-zinc-200'}`}>{label}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[#6C6C74] mt-1.5">
              Usado para adaptar as estatísticas de treino (detalhamento de braços/pernas).
            </p>
          </div>

          <div>
            <label className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold block mb-1.5">Pacote do Aluno</label>
            <div className="flex flex-col sm:flex-row gap-2">
              {pacoteOptions.map(opt => {
                const selecionado = pacote === opt.valor;
                return (
                  <button
                    key={opt.valor}
                    type="button"
                    onClick={() => setPacote(opt.valor)}
                    disabled={saving}
                    className={`flex-1 border p-3 text-left transition-all duration-150 disabled:opacity-60 clip-bevel-sm ${
                      selecionado
                        ? 'bg-accent/10 border-accent'
                        : 'bg-panel-2 border-line hover:border-[#3A3A40]'
                    }`}
                  >
                    <p className={`text-sm font-bold ${selecionado ? 'text-accent-light' : 'text-zinc-200'}`}>
                      {opt.titulo}
                    </p>
                    <p className="text-[11px] text-muted-steel mt-0.5">{opt.descricao}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[#6C6C74] mt-1.5">
              A alteração do pacote é aplicada imediatamente para o aluno.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="btn-steel"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={!nome.trim() || saving}
            className="btn-forge"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
