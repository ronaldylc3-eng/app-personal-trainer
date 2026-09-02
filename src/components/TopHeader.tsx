import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown, Shield, Flame } from 'lucide-react';
import StudentAvatar from './ui/StudentAvatar';
import { useAuth } from '../hooks/useAuth';
import { useSequencia } from '../hooks/useSequencia';
import { auth } from '../services/api';
import { MobileMenuButton } from './Sidebar';
import { LogoWordmark } from './icons/AppIcons';

function getInitials(name: string): string {
  const parts = name?.split(' ') || [];
  const f = parts[0]?.[0] ?? '';
  const l = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (f + l).toUpperCase() || '?';
}

interface TopHeaderProps {
  onMenuClick?: () => void;
}

export default function TopHeader({ onMenuClick }: TopHeaderProps) {
  const { profile, loading, isAdmin } = useAuth();
  const sequencia = useSequencia(profile?.id);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const nome = profile?.nome ?? 'Usuario';
  const initials = getInitials(nome);

  return (
    <header className="relative z-[35] min-h-[58px] shrink-0 bg-ink/60 backdrop-blur-sm border-b border-line flex items-center justify-between gap-3 pl-4 pr-4 md:pr-5 pt-[env(safe-area-inset-top)] pb-2.5">
      <div className="flex items-center gap-2">
        <MobileMenuButton onClick={onMenuClick || (() => {})} />
        <span className="md:hidden">
          <LogoWordmark size="sm" />
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <div
          title={`${sequencia.streak} ${sequencia.streak === 1 ? 'dia' : 'dias'} de sequência de treinos`}
          className={`flex items-center gap-1.5 h-[34px] px-3 bg-panel border border-line clip-bevel-sm ${
            sequencia.loading || sequencia.streak === 0 ? 'text-muted-steel' : 'text-accent-light'
          }`}
        >
          <Flame size={14} strokeWidth={2.2} />
          <span className="text-[12.5px] font-bold stat-number">{sequencia.loading ? '·' : sequencia.streak}</span>
        </div>
        <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2.5 px-1.5 py-1 hover:bg-panel transition-colors clip-bevel-sm"
        >
          <StudentAvatar size="sm" />
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-[12px] font-semibold text-bone leading-tight">
              {loading ? 'Carregando...' : nome}
            </span>
            {isAdmin && (
              <span className="flex items-center gap-1 text-[10px] text-accent-light font-medium leading-tight">
                <Shield size={9} /> Admin
              </span>
            )}
          </div>
          <ChevronDown
            size={14}
            className={`text-muted-steel transition-transform duration-150 hidden sm:block ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-40 bg-panel border border-line clip-bevel-sm shadow-xl shadow-black/40 p-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
            <button
              onClick={async () => {
                setOpen(false);
                await auth.signOut();
                navigate('/');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-red-400 hover:bg-red-500/10 transition-colors font-semibold"
            >
              <LogOut size={14} strokeWidth={1.8} />
              Sair
            </button>
          </div>
        )}
        </div>
      </div>
    </header>
  );
}
