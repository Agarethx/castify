// apps/web/lib/p2p/session-reporter.ts
// IMPORTANTE: este archivo no debe importar nada de tracker.ts ni scheduler.ts
// Es código puro browser: solo fetch, setInterval, y tipos básicos

import type { SessionSnapshot, PlayerState } from '@castify/types'

export class SessionReporter {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private sessionId: string = crypto.randomUUID()
  private counters = {
    bufferingEvents: 0,
    qualityChanges: 0,
    segmentsFromPeer: 0,
    segmentsFromCdn: 0,
  }

  constructor(
    private contentId: string,
    private channelId: string,
    private apiUrl: string,
  ) {}

  recordEvent(type: string, _data?: Record<string, unknown>): void {
    if (type === 'buffering_start') this.counters.bufferingEvents++
    if (type === 'quality_change') this.counters.qualityChanges++
    if (type === 'segment_loaded') {
      const source = (_data?.source as string) ?? 'cdn'
      if (source === 'peer') this.counters.segmentsFromPeer++
      else this.counters.segmentsFromCdn++
    }
  }

  start(getPlayerState: () => PlayerState): void {
    if (this.intervalId) return
    this.intervalId = setInterval(async () => {
      const state = getPlayerState()
      const snapshot = this.buildSnapshot(state)
      await this.send(snapshot)
      this.resetCounters()
    }, 5000)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private buildSnapshot(state: PlayerState): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      contentId: this.contentId,
      channelId: this.channelId,
      timestamp: Date.now(),
      status: state.status,
      currentTimeMs: state.currentTime * 1000,
      bufferAheadSec: state.buffered,
      qualityHeight: state.quality?.height ?? 0,
      peersConnected: state.peersConnected ?? 0,
      bytesFromPeers: state.bytesFromPeers ?? 0,
      bytesFromCdn: state.bytesFromCdn ?? 0,
      p2pOffloadPct: state.p2pOffloadPct ?? 0,
      estimatedBandwidthKbps: 0,
      avgPeerLatencyMs: 0,
      ...this.counters,
    }
  }

  private async send(snapshot: SessionSnapshot): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/streaming/session/snapshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': this.sessionId,
        },
        body: JSON.stringify(snapshot),
        keepalive: true,
      })
    } catch (err) {
      console.error('[SessionReporter] send failed:', err)
    }
  }

  private resetCounters(): void {
    this.counters = {
      bufferingEvents: 0,
      qualityChanges: 0,
      segmentsFromPeer: 0,
      segmentsFromCdn: 0,
    }
  }
}
