import { User } from 'lucide-react';

const SIZES = {
  sm: { box: 32, icon: 14 },
  md: { box: 40, icon: 18 },
  lg: { box: 46, icon: 22 },
} as const;

const RADIUS = { sm: 'rounded-lg', md: 'rounded-xl', lg: 'rounded-xl' } as const;

export default function StudentAvatar({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const s = SIZES[size];
  const glow = size === 'lg' ? 'neon-icon-lg' : 'neon-icon';

  return (
    <div
      className={`${RADIUS[size]} flex-none flex items-center justify-center bg-gradient-to-br from-[#323236] to-[#161619] border border-accent/25 shadow-glow ${className}`}
      style={{ width: s.box, height: s.box }}
    >
      <User size={s.icon} className={`text-accent-light ${glow}`} strokeWidth={2.2} />
    </div>
  );
}
