const SESSION_POLICY_EXEMPT_EMAILS = new Set([
  'js@santoslab.de',
  'nathalie.kress@mtcon.eu',
]);

export function isSessionPolicyExemptEmail(email?: string | null) {
  return Boolean(email && SESSION_POLICY_EXEMPT_EMAILS.has(email.toLowerCase()));
}