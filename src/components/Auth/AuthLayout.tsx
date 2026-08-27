import type { ReactNode } from 'react';
import { Dumbbell } from 'lucide-react';

interface SideStat {
  value: string;
  label: string;
}

interface AuthLayoutProps {
  image: string;
  fallbackImage: string;
  imagePosition?: string;
  eyebrow: string;
  title: ReactNode;
  description?: string;
  stats?: SideStat[];
  children: ReactNode;
}

export function BrandLogo({ size, cut }: { size: number; cut: string }) {
  return (
    <div
      className={`${cut} bg-gradient-to-br from-accent-light to-plate shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] flex items-center justify-center shrink-0`}
      style={{ width: size, height: size }}
    >
      <Dumbbell size={Math.round(size * 0.48)} color="#170B04" strokeWidth={2.75} />
    </div>
  );
}

function DesktopBrand() {
  return (
    <div className="hidden min-[900px]:flex items-center gap-2.5 mb-11">
      <BrandLogo size={38} cut="clip-bevel" />
      <div className="leading-tight">
        <b className="font-display text-[15px] tracking-[0.03em] block">FITNESSAPP</b>
        <span className="text-[11px] text-muted-steel">Treinos &amp; Dieta</span>
      </div>
    </div>
  );
}

export default function AuthLayout({
  image,
  fallbackImage,
  imagePosition = 'center 32%',
  eyebrow,
  title,
  description,
  stats,
  children,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-ink text-bone flex flex-col min-[900px]:flex-row">
      <aside className="relative overflow-hidden flex-none h-[34vh] min-h-[190px] max-h-[280px] border-b border-line min-[900px]:flex-[1.1] min-[900px]:h-auto min-[900px]:max-h-none min-[900px]:min-h-screen min-[900px]:border-b-0 min-[900px]:border-r">
        <div
          className="absolute inset-0 bg-cover bg-no-repeat grayscale contrast-[1.15] brightness-50"
          style={{ backgroundImage: `url('${image}'), url('${fallbackImage}')`, backgroundPosition: imagePosition }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/25 via-ink/55 to-ink/[0.97] min-[900px]:from-ink/35 min-[900px]:to-ink/[0.96]" />
        <div className="stripe-overlay" />
        <div className="relative z-[2] h-full flex flex-col justify-end px-[22px] pt-4 pb-5 min-[900px]:p-14">
          <div className="flex items-center gap-2 mb-auto min-[900px]:hidden">
            <BrandLogo size={26} cut="clip-bevel-sm" />
            <span className="font-display text-[13px] tracking-[0.03em]">FITNESSAPP</span>
          </div>
          <p className="hidden min-[900px]:inline-flex items-center gap-2 font-display text-[11px] tracking-[0.18em] uppercase text-accent-light mb-2 w-fit before:content-[''] before:w-5 before:h-0.5 before:bg-accent">
            {eyebrow}
          </p>
          <h1 className="font-display font-normal uppercase text-[26px] leading-[1.05] max-w-[420px] [&_em]:not-italic [&_em]:text-accent-light min-[900px]:text-[42px]">
            {title}
          </h1>
          {description && (
            <p className="hidden min-[900px]:block text-[#C9C8CC] text-sm max-w-[360px] leading-relaxed mt-2.5">
              {description}
            </p>
          )}
          {stats && stats.length > 0 && (
            <div className="hidden min-[900px]:flex gap-8 mt-6">
              {stats.map(s => (
                <div key={s.label} className="border-l-2 border-accent pl-3">
                  <b className="font-display text-[22px] block leading-tight">{s.value}</b>
                  <span className="text-[10px] text-muted-steel uppercase tracking-[0.08em]">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="relative flex-1 flex items-center justify-center px-5 pt-8 pb-11 min-[900px]:px-6 min-[900px]:py-10">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_600px_400px_at_80%_0%,rgba(255,90,31,0.06),transparent_60%)]" />
        <div className="w-full max-w-[380px] relative z-[2]">
          <DesktopBrand />
          {children}
        </div>
      </main>
    </div>
  );
}
