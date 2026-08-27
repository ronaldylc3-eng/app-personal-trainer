import { NavLink } from 'react-router-dom';
import { User, Dumbbell, Apple, Home, BarChart3, Users, FileText, Menu, X, ChevronRight, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { haptics } from '../utils/haptics';

const allLinks = [
  { to: '/alunos', label: 'Alunos', icon: Users, vipOnly: true, gestorOnly: true },
  { to: '/treinos', label: 'Treino', icon: Dumbbell, vipOnly: false, gestorHidden: true },
  { to: '/dieta', label: 'Dieta', icon: Apple, vipOnly: true, gestorHidden: true },
  { to: '/progresso', label: 'Progressão', icon: BarChart3, vipOnly: false, gestorHidden: true },
  { to: '/relatorios', label: 'Relatórios', icon: FileText, gestorOnly: true },
];

const allBottomNavItems = [
  { to: '/inicio', label: 'Início', icon: Home },
  { to: '/treinos', label: 'Treino', icon: Dumbbell, gestorHidden: true },
  { to: '/dieta', label: 'Dieta', icon: Apple, vipOnly: true, gestorHidden: true },
  { to: '/progresso', label: 'Progresso', icon: BarChart3, gestorHidden: true },
  { to: '/alunos', label: 'Alunos', icon: Users, gestorOnly: true },
  { to: '/relatorios', label: 'Relatórios', icon: FileText, gestorOnly: true },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  isVIP?: boolean;
  isAdmin?: boolean;
  isPremium?: boolean;
}

function filterByPlan(items: typeof allLinks, isVIP: boolean, isAdmin: boolean, isPremium: boolean) {
  return items.filter(item => {
    if ((item as any).gestorHidden && isAdmin) return false;
    if (item.gestorOnly && !isAdmin) return false;
    if (item.vipOnly && !isVIP && !isAdmin) return false;
    if ((item as any).premiumHidden && isPremium && !isAdmin) return false;
    return true;
  });
}

export function BrandMark() {
  return (
    <div className="flex items-center gap-[11px] px-1.5 pb-5 pt-0.5 border-b border-line">
      <div className="w-[38px] h-[38px] flex-none bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel-sm">
        <Dumbbell size={18} strokeWidth={2.5} className="text-[#170B04]" />
      </div>
      <div>
        <h1 className="font-display text-[15px] tracking-[0.02em] text-bone leading-tight">FITNESSAPP</h1>
        <p className="text-[11px] text-muted-steel leading-tight">Treinos &amp; Dieta</p>
      </div>
    </div>
  );
}

function QuoteBlock() {
  return (
    <div className="mt-auto border-t border-line px-3.5 py-[18px]">
      <p className="font-display text-[15px] uppercase leading-[1.25] text-bone mb-1.5">
        Disciplina, foco, <span className="text-accent-light">constância,<br />resultados.</span>
      </p>
      <small className="block text-[11px] text-muted-steel">Construa hoje a sua melhor versão.</small>
      <span className="block mt-3.5 text-[10px] text-[#4A4A50]">v1.0.0</span>
    </div>
  );
}

// Botao de nav grande com corte diagonal no canto superior direito
const NAV_CLIP = '[clip-path:polygon(0_0,calc(100%-16px)_0,100%_100%,0_100%)]';
const navItemBase = `relative group flex items-center gap-3.5 px-[18px] py-4 text-[15px] font-bold border transition-all duration-150 ${NAV_CLIP}`;
const navItemIdle = `${navItemBase} bg-panel border-line text-muted-steel hover:text-bone hover:border-[#3A3A40]`;
const navItemActive = `${navItemBase} bg-gradient-to-b from-accent-light via-accent to-plate border-plate text-[#170B04] font-display font-normal uppercase tracking-[0.03em] text-[15px] shadow-[inset_0_2px_0_rgba(255,255,255,0.5),inset_0_-8px_12px_rgba(0,0,0,0.3),0_8px_18px_-10px_rgba(255,90,31,0.6)]`;

function NavArrow({ ativo }: { ativo: boolean }) {
  return (
    <ChevronRight
      size={14}
      strokeWidth={3}
      className={`ml-auto w-3.5 h-3.5 shrink-0 transition-all duration-150 ${
        ativo
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0'
      }`}
    />
  );
}

function NavItems({
  links,
  isAdmin = false,
  onNavigate,
}: {
  links: typeof allLinks;
  isAdmin?: boolean;
  onNavigate?: () => void;
}) {
  const primaryItem = {
    to: '/inicio',
    label: isAdmin ? 'Sala de Comando' : 'Início',
    icon: isAdmin ? Activity : Home,
  };

  return (
    <>
      <NavLink
        to={primaryItem.to}
        onClick={onNavigate}
        className={({ isActive }) => `${isActive ? navItemActive : navItemIdle}`}
      >
        {({ isActive }) => (
          <>
            <primaryItem.icon size={21} strokeWidth={2} />
            <span className="truncate">{primaryItem.label}</span>
            <NavArrow ativo={isActive} />
          </>
        )}
      </NavLink>
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) => `${isActive ? navItemActive : navItemIdle}`}
        >
          {({ isActive }) => (
            <>
              <Icon size={21} strokeWidth={2} />
              <span>{label}</span>
              <NavArrow ativo={isActive} />
            </>
          )}
        </NavLink>
      ))}
    </>
  );
}

export default function Sidebar({ mobileOpen = false, onMobileClose, isVIP = false, isAdmin = false, isPremium = false }: SidebarProps) {
  const links = filterByPlan(allLinks, isVIP, isAdmin, isPremium);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  function handleNavClick() {
    onMobileClose?.();
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[264px] flex-none bg-gradient-to-b from-[#141416] to-[#0D0D0E] border-r border-line flex-col h-screen sticky top-0 px-4 pt-[22px] pb-0 overflow-y-auto">
        <BrandMark />

        <nav className="flex-1 pt-[22px] flex flex-col gap-2.5">
          <NavItems links={links} isAdmin={isAdmin} />
        </nav>

        <QuoteBlock />
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={onMobileClose}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <aside
              className="absolute left-0 top-0 bottom-0 w-[280px] bg-gradient-to-b from-[#141416] to-[#0D0D0E] border-r border-line flex flex-col z-50 animate-in slide-in-from-left duration-200"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-col h-full overflow-y-auto px-4 pt-[22px]">
                <div className="relative">
                  <BrandMark />
                  <button onClick={onMobileClose} className="absolute right-0 top-0 p-2 text-muted-steel hover:text-bone transition-colors" aria-label="Fechar menu">
                    <X size={18} />
                  </button>
                </div>

                <nav className="flex-1 pt-[22px] flex flex-col gap-2.5">
                  <NavItems links={links} isAdmin={isAdmin} onNavigate={handleNavClick} />
                </nav>

                <QuoteBlock />
              </div>
            </aside>
        </div>
      )}
    </>
  );
}

export function BottomNav({ isVIP = false, isAdmin = false, isPremium = false }: { isVIP?: boolean; isAdmin?: boolean; isPremium?: boolean }) {
  const items = filterByPlan(allBottomNavItems, isVIP, isAdmin, isPremium);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0F0F12]/95 backdrop-blur-xl border-t border-[#232328] px-2 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-around">
        {items.map(({ to, label, icon: Icon }) => {
          const displayLabel = to === '/inicio' && isAdmin ? 'Comando' : label;
          const DisplayIcon = to === '/inicio' && isAdmin ? Activity : Icon;

          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => haptics.tap()}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 px-3 py-1.5 transition-all duration-150 min-w-[56px] min-h-[46px] rounded-xl active:scale-95 ${
                  isActive
                    ? 'text-accent-light'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute -top-1.5 w-6 h-0.5 bg-gradient-to-r from-accent-light to-accent rounded-full shadow-[0_0_8px_rgba(255,90,31,0.8)]" />
                  )}
                  <DisplayIcon size={20} strokeWidth={isActive ? 2.4 : 1.8} className={isActive ? 'drop-shadow-[0_0_8px_rgba(255,90,31,0.4)]' : ''} />
                  <span className="text-[10px] font-bold tracking-[0.02em] leading-none">{displayLabel}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors"
    >
      <Menu size={20} />
    </button>
  );
}
