import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type UserAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface UserLike {
  id?: string;
  display_name?: string | null;
  short_code?: string | null;
  avatar_url?: string | null;
}

interface Props {
  user?: UserLike | null;
  size?: UserAvatarSize;
  showName?: boolean;
  className?: string;
  ringColor?: string; // CSS color for xl ring (department color)
  /** show a tooltip with full name on hover (default true) */
  tooltip?: boolean;
}

const SIZE_MAP: Record<UserAvatarSize, { px: number; cls: string; text: string }> = {
  sm: { px: 32, cls: 'h-8 w-8', text: 'text-[11px]' },
  md: { px: 40, cls: 'h-10 w-10', text: 'text-xs' },
  lg: { px: 56, cls: 'h-14 w-14', text: 'text-sm' },
  xl: { px: 120, cls: 'h-[120px] w-[120px]', text: 'text-3xl' },
};

// Stable color from name → muted accent
const PALETTE = [
  'bg-[hsl(220_60%_50%/0.18)] text-[hsl(220_85%_72%)]',
  'bg-[hsl(160_55%_45%/0.18)] text-[hsl(160_70%_68%)]',
  'bg-[hsl(28_85%_55%/0.18)] text-[hsl(28_95%_72%)]',
  'bg-[hsl(280_55%_55%/0.18)] text-[hsl(280_75%_75%)]',
  'bg-[hsl(0_70%_55%/0.18)] text-[hsl(0_80%_75%)]',
  'bg-[hsl(190_70%_45%/0.18)] text-[hsl(190_80%_70%)]',
  'bg-[hsl(45_85%_50%/0.18)] text-[hsl(45_90%_72%)]',
];

function initialsOf(u?: UserLike | null) {
  const name = u?.display_name?.trim() || u?.short_code || '';
  if (!name) return '–';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function firstNameOf(u?: UserLike | null): string | null {
  const name = u?.display_name?.trim();
  if (!name) return null;
  const first = name.split(/\s+/)[0];
  return first || null;
}

// Nutzer, für die (noch) kein Thumb gezeigt werden soll – auch wenn ein Vorname-Match existiert.
const THUMB_BLOCKLIST = new Set<string>(['anja magnussen']);

function thumbUrlFor(u?: UserLike | null): string | null {
  const full = u?.display_name?.trim().toLowerCase();
  if (full && THUMB_BLOCKLIST.has(full)) return null;
  const first = firstNameOf(u);
  if (!first || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/thumbs/Thumb_${encodeURIComponent(first)}.jpg`;
}

export function UserAvatar({
  user, size = 'md', showName = false, className, ringColor, tooltip = true,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const dim = SIZE_MAP[size];
  const initials = initialsOf(user);
  const palette = useMemo(() => colorFor(user?.id || user?.display_name || 'x'), [user?.id, user?.display_name]);

  // xl (Hero) zeigt das Original aus `avatars`, alle kleineren Größen das Thumbnail aus `thumbs`.
  const thumb = useMemo(() => thumbUrlFor(user), [user?.display_name]);
  const imageSrc = size === 'xl'
    ? (user?.avatar_url || thumb)
    : (thumb || user?.avatar_url);
  const hasImage = !!imageSrc && !errored;

  const ringStyle = size === 'xl' && ringColor
    ? { boxShadow: `0 0 0 3px hsl(var(--background)), 0 0 0 5px ${ringColor}, 0 0 24px ${ringColor}55` }
    : undefined;

  const avatar = (
    <div
      className={cn(
        'relative rounded-full overflow-hidden flex items-center justify-center shrink-0 select-none',
        dim.cls,
        !hasImage && palette,
        size === 'xl' && 'ring-1 ring-border/50',
        className,
      )}
      style={ringStyle}
      aria-label={user?.display_name || 'Avatar'}
    >
      {hasImage ? (
        <img
          src={imageSrc!}
          alt={user?.display_name || 'Avatar'}
          width={dim.px}
          height={dim.px}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : (
        <span className={cn('font-semibold tracking-tight', dim.text)}>{initials}</span>
      )}
    </div>
  );

  const wrapped = tooltip && user?.display_name ? (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{avatar}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">{user.display_name}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : avatar;

  if (showName) {
    return (
      <div className="flex items-center gap-2">
        {wrapped}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate leading-tight">
            {user?.display_name || '–'}
          </p>
          {user?.short_code && (
            <p className="text-[10px] text-muted-foreground font-mono">{user.short_code}</p>
          )}
        </div>
      </div>
    );
  }

  return wrapped;
}

export default UserAvatar;
