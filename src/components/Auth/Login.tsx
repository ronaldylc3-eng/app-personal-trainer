import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, Check } from 'lucide-react';
import { auth } from '../../services/api';
import AuthLayout from './AuthLayout';

const LOGIN_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1400&auto=format&fit=crop';

export default function Login() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState<string>(
    () => (location.state as { successMsg?: string } | null)?.successMsg ?? ''
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const { user } = await auth.signIn(email, password, lembrar);
      if (!user) throw new Error('Credenciais inválidas.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao processar solicitação';
      if (
        message.includes('Invalid login credentials') ||
        message.includes('invalid_grant') ||
        message.includes('Email not confirmed')
      ) {
        setError('E-mail ou senha incorretos.');
      } else if (message.includes('Password should be at least 6 characters')) {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      image="/auth/login.jpg"
      fallbackImage={LOGIN_IMAGE_FALLBACK}
      imagePosition="center 32%"
      eyebrow="FITNESSAPP · ACESSO"
      title={<>Sua ficha.<br />Seu <em>ritmo.</em></>}
      description="Entre pra ver seu treino de hoje, registrar a refeição e acompanhar sua evolução."
      stats={[
        { value: '1.2K+', label: 'Fichas ativas' },
        { value: '98%', label: 'Concluem a semana' },
        { value: '4.9', label: 'Avaliação média' },
      ]}
    >
      <p className="font-display uppercase text-[12px] tracking-[0.14em] text-accent-light mb-2">
        Bem-vindo de volta
      </p>
      <h2 className="font-display uppercase text-[28px] mb-2">
        Entrar na conta
      </h2>
      <p className="text-muted-steel text-[13.5px] leading-normal mb-6">
        Use o e-mail e a senha cadastrados para acessar seu painel.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="mb-[18px]">
          <label htmlFor="login-email" className="block text-[11px] tracking-[0.08em] uppercase text-muted-steel font-bold mb-2">
            E-mail
          </label>
          <div className="field-bevel">
            <Mail size={16} strokeWidth={2} className="ml-3.5 shrink-0 text-muted-steel" />
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoFocus
              required
              className="focus:outline-none focus:border-transparent focus:ring-0 focus:shadow-none"
            />
          </div>
        </div>

        <div className="mb-0.5">
          <label htmlFor="login-senha" className="block text-[11px] tracking-[0.08em] uppercase text-muted-steel font-bold mb-2">
            Senha
          </label>
          <div className="field-bevel">
            <Lock size={16} strokeWidth={2} className="ml-3.5 shrink-0 text-muted-steel" />
            <input
              id="login-senha"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="focus:outline-none focus:border-transparent focus:ring-0 focus:shadow-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="px-3.5 text-muted-steel hover:text-bone transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 my-2 mb-6">
          <button
            type="button"
            role="checkbox"
            aria-checked={lembrar}
            onClick={() => setLembrar(!lembrar)}
            className="flex items-center gap-2.5 group min-h-[44px]"
          >
            <span
              className={`w-[18px] h-[18px] flex-none flex items-center justify-center clip-bevel-sm border transition-colors duration-150 ${
                lembrar
                  ? 'bg-gradient-to-br from-accent-light to-accent border-accent shadow-[0_0_8px_rgba(255,90,31,0.35)]'
                  : 'bg-panel-2 border-line group-hover:border-[#3A3A40]'
              }`}
            >
              {lembrar && <Check size={12} strokeWidth={4} className="text-[#170B04]" />}
            </span>
            <span className="text-[13px] text-muted-steel group-hover:text-zinc-300 transition-colors select-none">
              Manter login por 30 dias
            </span>
          </button>
          <Link
            to="/recuperar-senha"
            tabIndex={-1}
            className="text-[13px] font-semibold text-accent-light hover:underline shrink-0"
          >
            Esqueceu a senha?
          </Link>
        </div>

        {successMsg && (
          <div className="flex items-start gap-2 mb-4 bg-panel border border-line border-l-[3px] border-l-emerald-500 px-4 py-3 text-emerald-400 text-[13px] font-medium">
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 mb-4 bg-panel border border-line border-l-[3px] border-l-red-500 px-4 py-3 text-red-400 text-[13px] font-medium">
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-forge btn-full mt-4">
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              Entrar
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <p className="mt-8 text-[12.5px] text-[#5D5D64] text-center">
        FitnessApp · Treinos e Acompanhamento
      </p>
    </AuthLayout>
  );
}
