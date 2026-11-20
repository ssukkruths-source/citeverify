import React, { createContext, useContext, useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import {
  getSession,
  signInAnonymously,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  SupabaseSession,
  supabaseConfigured,
} from '../lib/supabase';

type AuthContextValue = { session: SupabaseSession; signOut: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function useSupabaseAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useSupabaseAuth must be used inside SupabaseAuthGate.');
  return value;
}

export const SupabaseAuthGate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = (event?: Event) => {
      const custom = event as CustomEvent<SupabaseSession | null> | undefined;
      if (custom?.detail) setSession(custom.detail);
      else getSession().then((value) => { if (active) setSession(value); }).catch((e) => { if (active) setError(e.message); });
    };
    const bootstrap = async () => {
      try {
        let value = await getSession();
        if (!value) value = await signInAnonymously();
        if (active) { setSession(value); setError(''); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not connect to Supabase Auth.');
      } finally {
        if (active) setReady(true);
      }
    };
    window.addEventListener('citeverify-auth-change', sync);
    window.addEventListener('storage', sync);
    bootstrap();
    return () => { active = false; window.removeEventListener('citeverify-auth-change', sync); window.removeEventListener('storage', sync); };
  }, []);

  const authAction = async (action: () => Promise<SupabaseSession | null>) => {
    setBusy(true); setError('');
    try {
      const value = await action();
      if (value) setSession(value);
      else setError('Check your email to confirm your account, then sign in.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed.');
    } finally { setBusy(false); }
  };

  if (session) {
    return <AuthContext.Provider value={{ session, signOut: async () => { await signOut(); setSession(null); } }}>{children}</AuthContext.Provider>;
  }

  if (!ready) return <div className="min-h-screen grid place-items-center bg-[#FAF9F5] text-sm text-[#687387]">Connecting to your secure CiteVerify workspace…</div>;

  return (
    <div className="min-h-screen bg-[#FAF9F5] px-4 grid place-items-center">
      <div className="w-full max-w-md rounded-3xl border border-[#E8E7E1] bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#EAF1FC] text-[#3268BB]"><ShieldCheck className="h-6 w-6" /></div>
          <div><h1 className="text-xl font-bold text-[#14233F]">CiteVerify</h1><p className="text-xs text-[#687387]">Secure research workspace</p></div>
        </div>
        <h2 className="text-2xl font-semibold text-[#14233F]">{mode === 'signin' ? 'Sign in to continue' : 'Create your account'}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#687387]">Your audits are saved to your private Supabase workspace.</p>
        <form className="mt-6 space-y-3" onSubmit={(event) => { event.preventDefault(); void authAction(() => mode === 'signin' ? signInWithPassword(email, password) : signUpWithPassword(email, password)); }}>
          <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="w-full rounded-xl border border-[#E8E7E1] px-4 py-3 text-sm outline-none focus:border-[#3268BB]" />
          <input type="password" required minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (at least 8 characters)" className="w-full rounded-xl border border-[#E8E7E1] px-4 py-3 text-sm outline-none focus:border-[#3268BB]" />
          <button disabled={busy} className="w-full rounded-xl bg-[#3268BB] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Connecting…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} className="mt-4 text-sm font-medium text-[#3268BB] hover:underline">
          {mode === 'signin' ? 'New to CiteVerify? Create an account' : 'Already registered? Sign in'}
        </button>
        <button disabled={busy} onClick={() => void authAction(signInAnonymously)} className="mt-2 block text-sm text-[#687387] hover:text-[#14233F] disabled:opacity-60">Continue without an account</button>
        {error && <p role="alert" className="mt-4 rounded-xl bg-[#F9E3E1] p-3 text-sm text-[#7A2E2A]">{error}</p>}
        <div className="mt-6 flex items-center gap-2 border-t border-[#E8E7E1] pt-4 text-xs text-[#687387]"><LockKeyhole className="h-4 w-4" /> Your saved work is protected by account-level access rules.</div>
        {!supabaseConfigured && <p className="mt-3 text-xs text-rose-700">Set the Supabase URL and publishable key in the frontend environment.</p>}
      </div>
    </div>
  );
};
