'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CastifyPlayer } from '@/components/castify/castify-player';
import type { LogoPosition } from '@/components/castify/castify-player';

interface ValidateSuccess {
  valid: true;
  streamKey: string;
  title: string;
}

type ValidateResult = ValidateSuccess | { valid: false };

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
// HLS playback base URL — override via NEXT_PUBLIC_HLS_URL
const HLS_URL = process.env['NEXT_PUBLIC_HLS_URL'] ?? 'http://localhost:8080';

function buildHlsUrl(streamKey: string): string {
  return `${HLS_URL}/hls/${streamKey}/index.m3u8`;
}

function isValidLogoPosition(v: string | null): v is LogoPosition {
  return v === 'top-left' || v === 'top-right' || v === 'bottom-left' || v === 'bottom-right';
}

export default function SessionEmbedPage({
  params,
}: {
  params: { sessionId: string };
}): React.JSX.Element {
  const searchParams = useSearchParams();

  const password     = searchParams.get('pwd');
  const logo         = searchParams.get('logo') ?? undefined;
  const primaryColor = searchParams.get('primaryColor') ?? undefined;
  const accentColor  = searchParams.get('accentColor') ?? undefined;
  const rawPosition  = searchParams.get('logoPosition');
  const logoPosition = isValidLogoPosition(rawPosition) ? rawPosition : 'top-left';
  const hideControls = searchParams.get('hideControls') === '1';

  const [hlsUrl, setHlsUrl]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!password) {
      setError('Acceso requerido');
      return;
    }

    async function validateAndLoad(): Promise<void> {
      try {
        const res = await fetch(`${API_URL}/api/sessions/${params.sessionId}/validate-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });

        if (!res.ok) {
          setError('Error de autenticación');
          return;
        }

        const data = (await res.json()) as ValidateResult;

        if (!data.valid) {
          setError('Contraseña incorrecta');
          return;
        }

        setHlsUrl(buildHlsUrl(data.streamKey));

        // Fire-and-forget: notify backend that viewer joined
        void fetch(`${API_URL}/api/sessions/${params.sessionId}/viewer-joined`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => null);
      } catch {
        setError('Error de conexión');
      }
    }

    void validateAndLoad();
  }, [password, params.sessionId]);

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100vw',
          height: '100vh',
          background: '#000',
          color: '#ef4444',
          fontFamily: 'sans-serif',
          fontSize: '0.875rem',
        }}
      >
        {error}
      </div>
    );
  }

  if (!hlsUrl) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100vw',
          height: '100vh',
          background: '#000',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '2px solid #fff',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <CastifyPlayer
        src={hlsUrl}
        isLive
        autoplay
        logo={logo}
        logoPosition={logoPosition}
        primaryColor={primaryColor}
        accentColor={accentColor}
        hideControls={hideControls}
        className="w-full h-full rounded-none"
      />
    </div>
  );
}
