import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/case-utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, href, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications((data as Notification[]) || []);
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    // Realtime subscription
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (!unreadIds.length) return;
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const dismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleClick = async (n: Notification) => {
    if (!n.read) await markAsRead(n.id);
    if (n.href) { navigate(n.href); setOpen(false); }
  };

  const TYPE_ICON_COLOR: Record<string, string> = {
    assignment: 'bg-primary/10 text-primary',
    status_change: 'bg-[hsl(var(--status-working))]/10 text-[hsl(var(--status-working))]',
    task_status_change: 'bg-[hsl(var(--status-working))]/10 text-[hsl(var(--status-working))]',
    project_status_change: 'bg-[hsl(var(--status-working))]/10 text-[hsl(var(--status-working))]',
    mention: 'bg-[hsl(var(--status-planning))]/10 text-[hsl(var(--status-planning))]',
    chat_message: 'bg-primary/10 text-primary',
    chat_reaction: 'bg-accent/30 text-accent-foreground',
    task_created: 'bg-[hsl(var(--status-planning))]/10 text-[hsl(var(--status-planning))]',
    note_created: 'bg-muted text-foreground',
    default: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative flex items-center justify-center h-8 w-8 rounded-md transition-colors',
          open ? 'bg-muted' : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground',
        )}
        aria-label="Benachrichtigungen"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center tabular-nums leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={cn(
          'absolute right-0 top-10 w-80 max-h-[480px] flex flex-col',
          'rounded-xl border border-border bg-popover shadow-2xl z-[100] overflow-hidden',
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Benachrichtigungen</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full font-medium">
                  {unreadCount} neu
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCheck className="h-3 w-3" />Alle gelesen
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">Keine Benachrichtigungen</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      'relative flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer group',
                      !n.read ? 'bg-primary/[0.03]' : '',
                      n.href ? 'hover:bg-muted/50' : 'cursor-default',
                    )}
                  >
                    {/* Unread dot */}
                    {!n.read && (
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}

                    {/* Icon */}
                    <div className={cn(
                      'h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5',
                      TYPE_ICON_COLOR[n.type] ?? TYPE_ICON_COLOR.default,
                    )}>
                      <Bell className="h-3.5 w-3.5" />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs leading-snug', !n.read ? 'font-medium text-foreground' : 'text-foreground/80')}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 mt-1 tabular-nums">
                        {formatRelativeTime(n.created_at)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!n.read && (
                        <button
                          onClick={e => { e.stopPropagation(); markAsRead(n.id); }}
                          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Als gelesen markieren"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => dismiss(n.id, e)}
                        className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Entfernen"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
