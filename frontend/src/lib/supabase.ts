type SupabaseUser = {
  id: string;
  email?: string;
  is_anonymous?: boolean;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: SupabaseUser;
};

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') || '';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || '';
const STORAGE_KEY = 'citeverify.supabase.session.v1';
let refreshPromise: Promise<SupabaseSession | null> | null = null;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

function readSession(): SupabaseSession | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) as SupabaseSession : null;
  } catch {
    return null;
  }
}

function saveSession(session: SupabaseSession | null) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('citeverify-auth-change', { detail: session }));
}

async function authPost(path: string, payload: unknown, accessToken?: string): Promise<any> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.msg || body.message || body.error_description || body.error || 'Supabase authentication failed.');
  return body;
}

function fromAuthResponse(body: any): SupabaseSession | null {
  if (!body.access_token || !body.refresh_token || !body.user?.id) return null;
  const session: SupabaseSession = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: body.expires_at || Math.floor(Date.now() / 1000) + (body.expires_in || 3600),
    user: body.user,
  };
  saveSession(session);
  return session;
}

export async function getSession(): Promise<SupabaseSession | null> {
  if (!supabaseConfigured) throw new Error('Supabase URL and publishable key are not configured.');
  const current = readSession();
  if (!current) return null;
  if (current.expires_at > Math.floor(Date.now() / 1000) + 60) return current;
  if (!refreshPromise) {
    refreshPromise = authPost('token?grant_type=refresh_token', { refresh_token: current.refresh_token })
      .then(fromAuthResponse)
      .catch(() => { saveSession(null); return null; })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function signInAnonymously(): Promise<SupabaseSession> {
  const result = fromAuthResponse(await authPost('signup', { data: { citeverify_guest: true } }));
  if (!result) throw new Error('Supabase did not return an anonymous session.');
  return result;
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const result = fromAuthResponse(await authPost('token?grant_type=password', { email, password }));
  if (!result) throw new Error('Supabase did not return a sign-in session.');
  return result;
}

export async function signUpWithPassword(email: string, password: string): Promise<SupabaseSession | null> {
  return fromAuthResponse(await authPost('signup', { email, password }));
}

export async function signOut(): Promise<void> {
  const current = await getSession();
  if (current) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${current.access_token}` },
    });
  }
  saveSession(null);
}

export async function getAccessToken(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Sign in to continue.');
  return session.access_token;
}

export async function upsertOwnedRows<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  conflict: string,
): Promise<void> {
  if (!rows.length) return;
  const session = await getSession();
  if (!session) throw new Error('Sign in to sync your CiteVerify data.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows.map((row) => ({ ...row, owner_id: session.user.id }))),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase sync failed (${response.status}): ${detail.slice(0, 240)}`);
  }
}

export async function deleteOwnedRows(table: string, filters: Record<string, string>): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Sign in to update your CiteVerify data.');
  const query = new URLSearchParams(filters);
  query.set('owner_id', `eq.${session.user.id}`);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}`, Prefer: 'return=minimal' },
  });
  if (!response.ok) throw new Error(`Supabase delete failed (${response.status}).`);
}

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export async function uploadPrivatePdf(file: File, auditId: string): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Sign in to save this paper privately.');
  if (file.size > 50 * 1024 * 1024) throw new Error('PDF exceeds the 50 MB upload limit.');
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-100) || 'paper.pdf';
  const path = `${session.user.id}/${auditId}/${crypto.randomUUID()}-${safeName}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/cv-documents/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'false',
    },
    body: file,
  });
  if (!response.ok) throw new Error(`Private PDF upload failed (${response.status}).`);
  return path;
}

export async function signedPrivatePdfUrl(path: string): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Sign in to open this paper.');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/cv-documents/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.signedURL) throw new Error(`Could not create a private PDF link (${response.status}).`);
  if (result.signedURL.startsWith('http')) return result.signedURL;
  if (result.signedURL.startsWith('/storage/v1/')) return `${SUPABASE_URL}${result.signedURL}`;
  return `${SUPABASE_URL}/storage/v1${result.signedURL.startsWith('/') ? result.signedURL : `/${result.signedURL}`}`;
}

export async function deletePrivatePdf(path: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Sign in to remove this paper.');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/cv-documents/${encodeStoragePath(path)}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok && response.status !== 404) throw new Error(`Could not remove the private PDF (${response.status}).`);
}

export async function getOwnedAuditPayload(auditId: string): Promise<Record<string, unknown> | null> {
  const session = await getSession();
  if (!session) return null;
  const query = new URLSearchParams({ select: 'payload', audit_id: `eq.${auditId}`, limit: '1' });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/cv_audits?${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error(`Could not read the saved CiteVerify record (${response.status}).`);
  const rows = await response.json() as { payload?: Record<string, unknown> }[];
  return rows[0]?.payload || null;
}
