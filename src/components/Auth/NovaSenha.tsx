import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, Loader2, Eye, EyeOff, Check, AlertCircle, Mail } from 'lucide-react';
import { auth } from '../../services/api';
import AuthLayout from './AuthLayout';

const SENHA_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1400&auto=format&fit=crop';

export default function NovaSenha() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    let mounted = true;
    async function checkUser() {
      const u = await auth.getUser();
      if (mounted && u) {
        setUserEmail(u.email || '');
      }
    }
    checkUser();
    return () => { mounted = false; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await auth.updatePassword(password);
      if (updateError) throw updateError;

      setSuccess('Senha redefinida com sucesso! Redirecionando para o login...');
      await auth.signOut();
      setTimeout(() => navigate('/'), 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao redefinir senha';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const lenOk = password.length >= 6;
  const matchOk = confirmPassword.length > 0 && password === confirmPassword;

  return (
    <AuthLayout
      image="/auth/senha.jpg"
      fallbackImage={SENHA_IMAGE_FALLBACK}
      imagePosition="center 30%"
      eyebrow="RECUPERAÇÃO DE ACESSO"
      title={<>Crie sua <em>nova senha</em>.</>}
      description="Escolha uma senha forte para voltar a acessar seus treinos e sua dieta."
    >
      <p className="font-display uppercase text-[12px] tracking-[0.14em] text-accent-light mb-2">
        Redefinição de senha
      </p>
      <h2 className="font-display uppercase text-[28px] mb-2">Nova senha</h2>
      <p className="text-muted-steel text-[13.5px] leading-normal mb-8">
        Digite a nova senha que você usará para entrar.
      </p>

      {userEmail && (
        <div className="flex items-center gap-2 mb-4 bg-panel border border-line px-3.5 py-2.5 text-muted-steel text-[12.5px]">
          <Mail size={14} className="text-accent-light shrink-0" />
          <span>Redefinindo senha para: <strong className="text-bone">{userEmail}</strong></span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-[18px]">
          <label htmlFor="nova-senha" className="block text-[11px] tracking-[0.08em] uppercase text-muted-steel font-bold mb-2">
            Nova Senha
          </label>
          <div className="field-bevel">
            <Lock size={16} strokeWidth={2} className="ml-3.5 shrink-0 text-muted-steel" />
            <input
              id="nova-senha"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoFocus
              required
              minLength={6}
              className="focus:outline-none focus:border-transparent focus:ring-0 focus:shadow-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="self-stretch flex items-center px-3.5 shrink-0 text-muted-steel hover:text-bone transition-colors"
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="nova-confirmar" className="block text-[11px] tracking-[0.08em] uppercase text-muted-steel font-bold mb-2">
            Confirmar Nova Senha
          </label>
          <div className="field-bevel">
            <Lock size={16} strokeWidth={2} className="ml-3.5 shrink-0 text-muted-steel" />
            <input
              id="nova-confirmar"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Digite a nova senha novamente"
              required
              minLength={6}
              className="focus:outline-none focus:border-transparent focus:ring-0 focus:shadow-none"
            />
          </div>
        </div>

        <div className="space-y-1.5 mb-6 text-[12px]">
          <div className={`flex items-center gap-2 transition-colors ${lenOk ? 'text-ok' : 'text-muted-steel'}`}>
            <span className={`w-3.5 h-3.5 flex items-center justify-center border clip-bevel-sm ${
              lenOk ? 'bg-ok/10 border-ok text-ok' : 'border-line text-transparent'
            }`}>
              <Check size={9} strokeWidth={3} />
            </span>
            <span>Pelo menos 6 caracteres</span>
          </div>
          <div className={`flex items-center gap-2 transition-colors ${matchOk ? 'text-ok' : 'text-muted-steel'}`}>
            <span className={`w-3.5 h-3.5 flex items-center justify-center border clip-bevel-sm ${
              matchOk ? 'bg-ok/10 border-ok text-ok' : 'border-line text-transparent'
            }`}>
              <Check size={9} strokeWidth={3} />
            </span>
            <span>As senhas coincidem</span>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 mb-4 bg-panel border border-line border-l-[3px] border-l-red-500 px-4 py-3 text-red-400 text-[13px] font-medium">
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 mb-4 bg-panel border border-line border-l-[3px] border-l-emerald-500 px-4 py-3 text-emerald-400 text-[13px] font-medium">
            <span>{success}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !lenOk || !matchOk}
          className="btn-forge btn-full mt-2"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              Salvar Nova Senha
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
