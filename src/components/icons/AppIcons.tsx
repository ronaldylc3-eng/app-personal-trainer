import type { CSSProperties, ReactNode } from 'react';

interface AppIconProps {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  style?: CSSProperties;
}

export function BarraOlimpicaIcon({ size = 24, strokeWidth = 2, className, style }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="2" y="10.5" width="3" height="3" />
      <rect x="6" y="9" width="2.5" height="6" />
      <rect x="15.5" y="9" width="2.5" height="6" />
      <rect x="19" y="10.5" width="3" height="3" />
      <line x1="8.5" y1="12" x2="15.5" y2="12" />
    </svg>
  );
}

export function TalherFolhaIcon({ size = 24, strokeWidth = 2, className, style }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M6 2v8a2 2 0 002 2v10M6 2v8M8.5 2v8M6 8h2.5" />
      <path d="M18 2c-2.2 0-4 2.5-4 6s1.8 6 4 6 4-2.5 4-6-1.8-6-4-6z" />
      <path d="M18 14v8" />
    </svg>
  );
}

export function CalendarioCanetaIcon({ size = 24, strokeWidth = 2, className, style }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="14" height="14" rx="1" />
      <path d="M3 9h14M7 3v3M13 3v3" />
      <path d="M15.5 15.5l4-4 2 2-4 4h-2v-2z" />
    </svg>
  );
}

export function RelatorioGraficoIcon({ size = 24, strokeWidth = 2, className, style }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M 5.3 5.3 L 5.3 18.7 L 19.7 18.7" />
      <path d="M 9.1 16.3 L 9.1 7.7" />
      <path d="M 13 16.3 L 13 12" />
      <path d="M 16.8 16.3 L 16.8 9.6" />
    </svg>
  );
}

export function PlacaTaticaIcon({ size = 46, className, style }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-none ${className || ''}`}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ptt-bg" cx="35%" cy="30%" r="85%">
          <stop offset="0%" stopColor="#2b2b2b" />
          <stop offset="55%" stopColor="#161616" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </radialGradient>
        <linearGradient id="ptt-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5a4a42" />
          <stop offset="45%" stopColor="#2c2622" />
          <stop offset="100%" stopColor="#1a1a1a" />
        </linearGradient>
        <filter id="ptt-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M 50,2 L 174,2 Q 198,2 198,26 V 150 L 150,198 H 26 Q 2,198 2,174 V 50 Z"
        fill="url(#ptt-bg)"
        stroke="url(#ptt-border)"
        strokeWidth="2.5"
      />

      <g filter="url(#ptt-glow)" stroke="#ff6a2b" strokeWidth="9" strokeLinecap="round" fill="none">
        <line x1="72" y1="130" x2="72" y2="95" />
        <line x1="100" y1="130" x2="100" y2="70" />
        <line x1="128" y1="130" x2="128" y2="108" />
      </g>
      <line x1="60" y1="140" x2="140" y2="140" stroke="#ff6a2b" strokeWidth="9" strokeLinecap="round" filter="url(#ptt-glow)" />
    </svg>
  );
}

export function LogoBadge({ size = 46, children }: { size?: number; children: ReactNode }) {
  return (
    <div
      className="relative flex-none clip-bevel flex items-center justify-center bg-[#212126] border border-accent/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_0_24px_-8px_rgba(255,90,31,0.25)]"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,90,31,0.2),transparent_65%)] pointer-events-none"
        aria-hidden="true"
      />
      <span className="relative flex items-center justify-center">{children}</span>
    </div>
  );
}

export function LogoWordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes =
    size === 'sm'
      ? { los: 'text-[8px]', gym: 'text-[24px]', rule: 'w-[38px] h-[2px]', mb: 'mb-1' }
      : size === 'lg'
      ? { los: 'text-[16px]', gym: 'text-[60px]', rule: 'w-[84px] h-[3px]', mb: 'mb-2' }
      : { los: 'text-[12px]', gym: 'text-[42px]', rule: 'w-[60px] h-[3px]', mb: 'mb-1.5' };
  return (
    <div className="inline-flex flex-col items-center leading-none select-none">
      <span className={`font-display block ${sizes.los} tracking-[0.5em] text-accent-light uppercase leading-none ${sizes.mb}`}>L O S</span>
      <span className={`font-display block ${sizes.gym} uppercase text-bone leading-[0.9] tracking-[0.03em]`}>GYM</span>
      <div className={`${sizes.rule} bg-accent mt-2`} />
    </div>
  );
}