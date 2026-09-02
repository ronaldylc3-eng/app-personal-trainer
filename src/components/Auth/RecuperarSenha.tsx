import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, Loader2, Check, AlertCircle } from 'lucide-react';
import { auth } from '../../services/api';
import AuthLayout from './AuthLayout';

const LOGIN_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1400&auto=format&fit=crop';

export default function RecuperarSenha() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const exists = await auth.checkEmailExists(email.trim());
      if (!exists) {
        setError('E-mail inválido ou não cadastrado no sistema.');
        return;
      }

      const { error: resetError } = await auth.resetPassword(email.trim());
      if (resetError) throw resetError;

      setSuccess('Enviamos um link de recuperação para seu e-mail. Verifique a caixa de entrada.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao processar solicitacao');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      image="/auth/login.jpg"
      fallbackImage={LOGIN_IMAGE_FALLBACK}
      imagePosition="center 32%"
      eyebrow="LOS GYM · TREINOS & DIETA"
      title={<>Perdeu a senha?<br />A gente <em>te ajuda.</em></>}
      description="Digite seu e-mail de cadastro e enviaremos um link para você definir uma nova senha."
    >
      <p className="font-display uppercase text-[12px] tracking-[0.14em] text-accent-light mb-2">
        Recuperar acesso
      </p>
      <h2 className="font-display uppercase text-[28px] mb-2">Recuperar senha</h2>
      <p className="text-muted-steel text-[13.5px] leading-normal mb-8">
        Informe o e-mail cadastrado para receber o link de redefinição.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="mb-1">
          <label htmlFor="recup-email" className="block text-[11px] tracking-[0.08em] uppercase text-muted-steel font-bold mb-2">
            E-mail
          </label>
          <div className="field-bevel">
            <Mail size={16} strokeWidth={2} className="ml-3.5 shrink-0 text-muted-steel" />
            <input
              id="recup-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoFocus
              required
              disabled={!!success}
              className="focus:outline-none focus:border-transparent focus:ring-0 focus:shadow-none disabled:opacity-50"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 mt-4 bg-panel border border-line border-l-[3px] border-l-red-500 px-4 py-3 text-red-400 text-[13px] font-medium">
            <AlertCircle size={15} className="mt-px shrink-0" /> <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 mt-4 bg-panel border border-line border-l-[3px] border-l-emerald-500 px-4 py-3 text-emerald-400 text-[13px] font-medium">
            <Check size={15} className="mt-px shrink-0" /> <span>{success}</span>
          </div>
        )}

        {!success && (
          <button type="submit" disabled={loading} className="btn-forge btn-full mt-5">
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                Enviar link de recuperação
                <ArrowRight size={16} />
              </>
            )}
          </button>
        )}
      </form>

      <p className="mt-7 text-center text-[12.5px] text-[#5D5D64]">
        <button onClick={() => navigate('/login')} className="font-semibold text-accent-light hover:underline">
          Voltar para o Login
        </button>
      </p>
    </AuthLayout>
  );
}
