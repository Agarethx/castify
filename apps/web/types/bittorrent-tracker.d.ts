// Minimal type declaration for bittorrent-tracker (no official @types package)
// Only declares what P2PTracker actually uses.

declare module 'bittorrent-tracker' {
  import { EventEmitter } from 'events';

  interface ClientOptions {
    infoHash: string | Buffer;
    peerId: string | Buffer;
    announce: string[];
    rtcConfig?: RTCConfiguration;
    getAnnounceOpts?: () => Record<string, unknown>;
  }

  class Client extends EventEmitter {
    constructor(opts: ClientOptions);
    start(): void;
    stop(): void;
    announce(opts?: Record<string, unknown>): void;
    scrape(opts?: Record<string, unknown>): void;
    destroy(cb?: () => void): void;
  }

  export = Client;
}
