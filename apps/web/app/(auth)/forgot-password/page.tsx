'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';

export default function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.auth.forgotPassword(email);
      setSent(true);
      if (res.devToken) setDevToken(res.devToken);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError('Error al procesar la solicitud. Intenta de nuevo.');
      } else {
        setError('Ocurrió un error inesperado');
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="h-16 w-16 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto">
            <svg className="h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">Revisá tu email</h1>
            <p className="mt-2 text-white/50 text-sm">
              Si existe una cuenta con <strong className="text-white/70">{email}</strong>, recibirás
              un enlace para restablecer tu contraseña.
            </p>
          </div>

          {/* Dev-mode token hint */}
          {devToken && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-left">
              <p className="text-xs text-yellow-400 font-semibold mb-1">🛠 Modo desarrollo</p>
              <p className="text-xs text-yellow-300/70 mb-2">
                No hay servicio de email configurado. Usá este enlace directo:
              </p>
              <Link
                href={`/reset-password?token=${devToken}`}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline break-all"
              >
                /reset-password?token={devToken}
              </Link>
            </div>
          )}

          <Link
            href="/login"
            className="inline-block text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            ← Volver al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Castify</h1>
          <p className="mt-2 text-white/50 text-sm">Recuperá tu contraseña</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-1">
              Email de tu cuenta
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="tu@email.com"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold transition-colors"
          >
            {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
          </button>
        </form>

        <p className="text-center text-sm text-white/40">
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
            ← Volver al login
          </Link>
        </p>
      </div>
    </div>
  );
}
