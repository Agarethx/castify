'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Radio, StopCircle, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type Quality = 'high' | 'medium' | 'low';
type StreamerStatus = 'idle' | 'connecting' | 'live' | 'error';

interface BrowserStreamerProps {
  streamKey: string;
  onStatusChange?: (status: StreamerStatus) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUALITY_CONSTRAINTS: Record<Quality, MediaTrackConstraints> = {
  high:   { width: 1280, height: 720,  frameRate: 30 },
  medium: { width: 854,  height: 480,  frameRate: 30 },
  low:    { width: 640,  height: 360,  frameRate: 24 },
};

const QUALITY_BITRATES: Record<Quality, number> = {
  high:   2_500_000,
  medium: 1_500_000,
  low:      800_000,
};

const QUALITY_LABELS: Record<Quality, string> = {
  high:   'Alta (720p · 2.5 Mbps)',
  medium: 'Media (480p · 1.5 Mbps)',
  low:    'Baja (360p · 800 kbps)',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); resolve(); }, 4000);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BrowserStreamer({ streamKey, onStatusChange }: BrowserStreamerProps) {
  const [status, setStatus]             = useState<StreamerStatus>('idle');
  const [error, setError]               = useState<string | null>(null);
  const [showSetup, setShowSetup]       = useState(false);
  const [quality, setQuality]           = useState<Quality>('medium');
  const [isMuted, setIsMuted]           = useState(false);
  const [isVideoOn, setIsVideoOn]       = useState(true);
  const [cameras, setCameras]           = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics]                 = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId]         = useState('');
  const [micId, setMicId]               = useState('');

  // Refs — never trigger re-renders
  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const liveVideoRef   = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const animFrameRef   = useRef<number>(0);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const previewStream  = useRef<MediaStream | null>(null);

  const updateStatus = useCallback((s: StreamerStatus) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  // ── Device enumeration ─────────────────────────────────────────────────────

  const loadDevices = useCallback(async () => {
    try {
      // First getUserMedia to unlock device labels in the browser
      const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      temp.getTracks().forEach((t) => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      const ms   = devices.filter((d) => d.kind === 'audioinput');
      setCameras(cams);
      setMics(ms);
      if (cams[0] && !cameraId) setCameraId(cams[0].deviceId);
      if (ms[0]   && !micId)    setMicId(ms[0].deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo acceder a la cámara');
      updateStatus('error');
    }
  }, [cameraId, micId, updateStatus]);

  // ── Get user media ─────────────────────────────────────────────────────────

  const getStream = useCallback(async (q: Quality, camId: string, mId: string) => {
    const constraints = QUALITY_CONSTRAINTS[q];
    return navigator.mediaDevices.getUserMedia({
      video: { ...constraints, ...(camId ? { deviceId: { exact: camId } } : {}) },
      audio: { ...(mId ? { deviceId: { exact: mId } } : {}) },
    });
  }, []);

  // ── Setup dialog preview ───────────────────────────────────────────────────

  useEffect(() => {
    if (!showSetup) {
      previewStream.current?.getTracks().forEach((t) => t.stop());
      previewStream.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const s = await getStream(quality, cameraId, micId);
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        previewStream.current?.getTracks().forEach((t) => t.stop());
        previewStream.current = s;
        if (previewVideoRef.current) previewVideoRef.current.srcObject = s;
      } catch {
        // preview may fail if device changes — ignore
      }
    })();

    return () => { cancelled = true; };
  }, [showSetup, quality, cameraId, micId, getStream]);

  // ── Audio visualizer ───────────────────────────────────────────────────────

  const setupVisualizer = useCallback((stream: MediaStream) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    audioCtxRef.current = audioCtx;

    const bufLen = analyser.frequencyBinCount;
    const data   = new Uint8Array(bufLen);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx.fillStyle = 'rgb(15,15,15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const bw = (canvas.width / bufLen) * 2.4;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const h = Math.round((data[i] / 255) * canvas.height);
        const r = Math.round((data[i] / 255) * 180 + 30);
        ctx.fillStyle = `rgb(${r},80,200)`;
        ctx.fillRect(x, canvas.height - h, bw, h);
        x += bw + 1;
      }
    };
    draw();
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    audioCtxRef.current?.close().catch(() => null);
    audioCtxRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Open setup dialog ──────────────────────────────────────────────────────

  const openSetup = async () => {
    await loadDevices();
    setShowSetup(true);
  };

  // ── Start streaming ────────────────────────────────────────────────────────

  const startStreaming = async () => {
    setShowSetup(false);
    updateStatus('connecting');
    setError(null);

    try {
      // 1. Acquire media
      const stream = await getStream(quality, cameraId, micId);
      streamRef.current = stream;
      if (liveVideoRef.current) liveVideoRef.current.srcObject = stream;
      setupVisualizer(stream);

      // 2. Fetch WHIP config (validates streamKey + gets ICE servers)
      const config = await api.streaming.getWhipConfig(streamKey);

      // 3. Create peer connection
      const pc = new RTCPeerConnection({ iceServers: config.iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // 4. Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 5. Wait for ICE gathering to embed candidates into SDP
      await waitForIceGathering(pc);

      // 6. POST offer to WHIP endpoint
      const resp = await fetch(config.whipUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body:    pc.localDescription!.sdp,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => resp.statusText);
        throw new Error(`WHIP ${resp.status}: ${text}`);
      }

      // 7. Set answer
      const answerSdp = await resp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      // 8. Apply bitrate cap on video sender
      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        const params = videoSender.getParameters();
        if (!params.encodings.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = QUALITY_BITRATES[quality];
        await videoSender.setParameters(params).catch(() => null);
      }

      updateStatus('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conectar con el servidor');
      updateStatus('error');
      cleanup();
    }
  };

  // ── Stop streaming ─────────────────────────────────────────────────────────

  const stopStreaming = () => {
    cleanup();
    updateStatus('idle');
  };

  // ── Toggle audio / video ───────────────────────────────────────────────────

  const toggleMute = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  };

  const toggleVideo = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsVideoOn(track.enabled);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Idle ── */}
      {status === 'idle' && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-muted/30 py-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Radio className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-medium">Transmití desde tu cámara</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sin instalar nada — directo desde el navegador
            </p>
          </div>
          <Button onClick={openSetup}>
            <Radio className="mr-2 h-4 w-4" />
            Iniciar transmisión
          </Button>
        </div>
      )}

      {/* ── Connecting ── */}
      {status === 'connecting' && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/30 py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Conectando con el servidor de streaming...</p>
        </div>
      )}

      {/* ── Live ── */}
      {status === 'live' && (
        <div className="space-y-3">
          {/* Video preview */}
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={liveVideoRef}
              autoPlay
              muted
              playsInline
              className={cn('w-full aspect-video object-cover', !isVideoOn && 'opacity-0')}
            />
            {!isVideoOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <VideoOff className="h-10 w-10 text-zinc-600" />
              </div>
            )}
            {/* LIVE badge */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              EN VIVO
            </div>
          </div>

          {/* Audio visualizer */}
          <canvas
            ref={canvasRef}
            width={400}
            height={40}
            className="w-full rounded-lg"
          />

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={toggleMute}>
              {isMuted ? <MicOff className="h-4 w-4 mr-1.5" /> : <Mic className="h-4 w-4 mr-1.5" />}
              {isMuted ? 'Activar mic' : 'Silenciar'}
            </Button>
            <Button variant="outline" size="sm" onClick={toggleVideo}>
              {isVideoOn ? <VideoOff className="h-4 w-4 mr-1.5" /> : <Video className="h-4 w-4 mr-1.5" />}
              {isVideoOn ? 'Pausar cámara' : 'Reanudar cámara'}
            </Button>
            <div className="flex-1" />
            <Button variant="destructive" size="sm" onClick={stopStreaming}>
              <StopCircle className="h-4 w-4 mr-1.5" />
              Detener
            </Button>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 py-8 px-4">
          <p className="text-sm font-medium text-destructive text-center">{error ?? 'Error desconocido'}</p>
          <Button variant="outline" size="sm" onClick={() => { setError(null); updateStatus('idle'); }}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Reintentar
          </Button>
        </div>
      )}

      {/* ── Setup dialog ── */}
      <Dialog open={showSetup} onOpenChange={(open) => {
        setShowSetup(open);
        if (!open) {
          previewStream.current?.getTracks().forEach((t) => t.stop());
          previewStream.current = null;
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Configurar transmisión
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Camera preview */}
            <div className="relative overflow-hidden rounded-lg bg-zinc-900">
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full aspect-video object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* shows only while stream loads */}
              </div>
            </div>

            {/* Camera selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cámara</label>
              <Select value={cameraId} onValueChange={setCameraId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cámara" />
                </SelectTrigger>
                <SelectContent>
                  {cameras.map((c) => (
                    <SelectItem key={c.deviceId} value={c.deviceId}>
                      {c.label || `Cámara ${cameras.indexOf(c) + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mic selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Micrófono</label>
              <Select value={micId} onValueChange={setMicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar micrófono" />
                </SelectTrigger>
                <SelectContent>
                  {mics.map((m) => (
                    <SelectItem key={m.deviceId} value={m.deviceId}>
                      {m.label || `Micrófono ${mics.indexOf(m) + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quality selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Calidad</label>
              <Select value={quality} onValueChange={(v) => setQuality(v as Quality)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => (
                    <SelectItem key={q} value={q}>
                      {QUALITY_LABELS[q]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" onClick={startStreaming}>
              <Radio className="h-4 w-4 mr-2" />
              Comenzar transmisión
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
