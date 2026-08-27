// =============================================================
// Aba "Progressão" do prontuário (visão do Gestor):
// volume semanal por macro-grupo do aluno + volume total 30 dias.
// =============================================================

import { useEffect, useState } from 'react';
import { BarChart3, Dumbbell, Loader2, AlertCircle, UserX } from 'lucide-react';
import { logsExecucao } from '../../services/api';
import { useAlunoContext } from './AlunoLayout';
import SecaoVolumeSemanal from '../Shared/SecaoVolumeSemanal';
import type { SessaoComProgresso } from '../../types';

export default function ProntuarioProgressao() {
  const { aluno } = useAlunoContext();
  const alunoId = aluno?.id;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sessoes, setSessoes] = useState<SessaoComProgresso[]>([]);
  const [volumeTotal, setVolumeTotal] = useState(0);

  useEffect(() => {
    if (!alunoId) return;
    let cancel = false;
    setLoading(true);
    setErro('');
    logsExecucao.getProgresso(alunoId)
      .then(d => {
        if (!cancel) setSessoes(d);
      })
      .catch(e => {
        if (!cancel) setErro(e instanceof Error ? e.message : 'Falha ao carregar a progressão do aluno.');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    logsExecucao.getVolumeTotal(alunoId)
      .then(v => {
        if (!cancel) setVolumeTotal(v);
      })
      .catch(() => {
        // Falha silenciosa: card exibe 0 kg
      });
    return () => { cancel = true; };
  }, [alunoId]);

  return (
    <div className="p-4 md:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">

        {/* Cabeçalho */}
        <div className="flex items-start gap-3.5">
          <div className="w-[46px] h-[46px] flex-none bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel">
            <BarChart3 size={22} className="text-[#170B04]" strokeWidth={2.4} />
          </div>
          <div>
            <h2 className="font-display uppercase text-[26px] leading-tight text-bone">Progressão</h2>
            <p className="text-[13.5px] text-muted-steel">
              Execução real dos treinos de {aluno?.nome?.split(' ')[0] || 'aluno'}, igual à visão dele.
            </p>
          </div>
        </div>

        {!alunoId ? (
          <div className="bg-panel border border-line p-8 text-center clip-bevel">
            <UserX size={28} className="mx-auto text-[#4A4A50] mb-3" />
            <p className="text-sm text-zinc-400">Nenhum aluno selecionado.</p>
          </div>
        ) : erro ? (
          <div className="flex items-center gap-2 px-4 py-2.5 text-xs border bg-red-500/10 text-red-300 border-red-500/20 clip-bevel-sm">
            <AlertCircle size={14} className="shrink-0" />
            <span>{erro}</span>
          </div>
        ) : loading ? (
          <div className="bg-panel border border-line p-8 text-center clip-bevel">
            <Loader2 size={22} className="mx-auto text-muted-steel animate-spin" />
            <p className="text-xs text-muted-steel mt-3">Carregando progressão...</p>
          </div>
        ) : (
          <>
            {/* Volume total movido (últimos 30 dias) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-panel border border-line p-5 md:p-[22px]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-[34px] h-[34px] flex-none bg-[#212126] border border-line flex items-center justify-center clip-bevel-sm text-accent-light">
                    <Dumbbell size={16} />
                  </div>
                  <span className="font-display text-[11.5px] tracking-[0.1em] text-muted-steel">VOLUME TOTAL MOVIDO</span>
                </div>
                <p className="font-display text-[32px] leading-none text-bone stat-number">
                  {volumeTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg
                </p>
                <p className="text-xs text-muted-steel mt-1.5">nos últimos 30 dias</p>
              </div>
            </div>

            {/* Volume semanal por macro-grupo (mesma seção do dashboard do aluno) */}
            <SecaoVolumeSemanal sessoes={sessoes} genero={aluno?.genero} />

            {sessoes.length === 0 && (
              <div className="bg-panel border border-line p-8 text-center">
                <Dumbbell size={28} className="mx-auto text-[#4A4A50] mb-3" />
                <p className="text-sm text-zinc-400">Este aluno ainda não concluiu nenhum treino.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
