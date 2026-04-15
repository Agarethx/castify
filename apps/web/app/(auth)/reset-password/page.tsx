'use client';

import { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';

function ResetPasswordForm(): React.JSX.Element {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const token         = searchParams.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState<string | null>(null);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-red-400">Enlace inválido o expirado.</p>
          <Link href="/forgot-password" className="text-indigo-400 hover:text-indigo-300 text-sm">
            Solicitá un nuevo enlace
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Ocurrió un error inesperado');
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-green-600/20 border border-green-500/30 flex items-center justify-center mx-auto">
            <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold">¡Contraseña actualizada!</h2>
          <p className="text-white/50 text-sm">Redirigiendo al login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Castify</h1>
          <p className="mt-2 text-white/50 text-sm">Creá tu nueva contraseña</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white/70 mb-1">
              Nueva contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-white/70 mb-1">
              Confirmar contraseña
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Repetí tu contraseña"
            />
          </div>

          {/* Password strength hint */}
          {password.length > 0 && (
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    password.length >= n * 3
                      ? n <= 1 ? 'bg-red-500'
                        : n <= 2 ? 'bg-yellow-500'
                          : n <= 3 ? 'bg-blue-500'
                            : 'bg-green-500'
                      : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
          )}

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
            {loading ? 'Actualizando...' : 'Actualizar contraseña'}
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

export default function ResetPasswordPage(): React.JSX.Element {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
