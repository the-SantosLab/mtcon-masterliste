// Shared helpers for Vorgang notification emails
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const adminClient = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

export async function getUserEmail(admin: ReturnType<typeof adminClient>, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

export async function getDisplayName(admin: ReturnType<typeof adminClient>, userId: string): Promise<string> {
  const { data } = await admin.from('users_profile').select('display_name').eq('id', userId).maybeSingle();
  return (data?.display_name as string) || 'Ein Benutzer';
}

const APP_URL = 'https://mtcon.kscommand.com';

export function emailLayout(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a; background: #ffffff;">
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">${title}</h2>
      <div style="font-size: 14px; color: #444; line-height: 1.55; margin: 0 0 24px;">${bodyHtml}</div>
      ${ctaUrl && ctaLabel ? `<a href="${ctaUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">${ctaLabel}</a>` : ''}
      <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0 12px;" />
      <p style="font-size: 11px; color: #bbb; margin: 0;">Masterliste · MTCON</p>
    </div>
  `;
}

export async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) { console.error('RESEND_API_KEY missing'); return false; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Masterliste <noreply@kscommand.com>',
      to: [to], subject, html,
    }),
  });
  if (!res.ok) {
    console.error('Resend send failed', await res.text());
    return false;
  }
  return true;
}

export async function logSent(
  admin: ReturnType<typeof adminClient>,
  type: string, vorgangId: string | null, recipientEmail: string,
) {
  await admin.from('notifications_log').insert({ type, vorgang_id: vorgangId, recipient_email: recipientEmail });
}

export const caseUrl = (id: string) => `${APP_URL}/cases/${id}`;
