'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoginSchema } from '@castify/validators';
import { useAuthStore } from '@/store/auth.store';
import { ApiClientError } from '@/lib/api';

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    const result = LoginSchema.safeParse({ email, password });
    if (!result.success) {
      const first = result.error.errors[0];
      setError(first?.message ?? 'Datos inválidos');
      return;
    }

    try {
      await login(result.data);
      router.push('/analytics');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 401) {
          setError('Email o contraseña incorrectos');
        } else {
          setError('Error al conectar con el servidor. Intenta de nuevo.');
        }
      } else {
        setError('Ocurrió un error inesperado');
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Castify</h1>
          <p className="mt-2 text-white/50 text-sm">Inicia sesión en tu cuenta</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="admin@demo.castify.tv"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white/70 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold transition-colors"
          >
            {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-center text-sm text-white/40">
          ¿No tenés cuenta?{' '}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
            Registrate
          </Link>
        </p>

        <p className="text-center text-xs text-white/20">
          Demo: admin@demo.castify.tv / demo2024
        </p>
      </div>
    </div>
  );
}
