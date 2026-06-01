import type { Location } from 'react-router-dom';

const AUTH_REDIRECT_KEY = 'mtcon.pending_auth_redirect';

function isSafeInternalPath(path: string | null | undefined): path is string {
  return !!path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/auth') && !path.startsWith('/reset-password');
}

export function pathFromLocation(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
  return `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`;
}

export function storeAuthRedirect(path: string | Pick<Location, 'pathname' | 'search' | 'hash'> | null | undefined) {
  const target = typeof path === 'string' ? path : path ? pathFromLocation(path) : null;
  if (!isSafeInternalPath(target)) return;
  try { sessionStorage.setItem(AUTH_REDIRECT_KEY, target); } catch { void 0; }
}

export function getStoredAuthRedirect(): string | null {
  try {
    const target = sessionStorage.getItem(AUTH_REDIRECT_KEY);
    return isSafeInternalPath(target) ? target : null;
  } catch { return null; }
}

export function clearStoredAuthRedirect() {
  try { sessionStorage.removeItem(AUTH_REDIRECT_KEY); } catch { void 0; }
}

export function getRedirectParam(search: string): string | null {
  try {
    const value = new URLSearchParams(search).get('redirect');
    return isSafeInternalPath(value) ? value : null;
  } catch { return null; }
}