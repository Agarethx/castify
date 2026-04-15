// Castify P2P Tracker — ESM (bittorrent-tracker v11 es ESM puro)
import { Server } from 'bittorrent-tracker'

const server = new Server({
  udp: false,
  http: false,
  ws: true,
  stats: true,
})

server.on('error', (err) => {
  console.error('[tracker] error:', err.message)
})

server.on('warning', (msg) => {
  console.warn('[tracker] warning:', String(msg))
})

server.on('listening', () => {
  console.log('[tracker] WebSocket tracker escuchando en ws://0.0.0.0:1337/announce')
})

server.on('start', (addr, params) => {
  const hash = Buffer.isBuffer(params.info_hash)
    ? params.info_hash.toString('hex').slice(0, 8)
    : String(params.info_hash ?? '').slice(0, 8)
  console.log(`[tracker] peer start: ${addr} infoHash=${hash}`)
})

server.on('stop', (addr) => {
  console.log(`[tracker] peer stop: ${addr}`)
})

server.listen(1337, '0.0.0.0', () => {
  console.log('[tracker] listo en puerto 1337')
})

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('[tracker] cerrado')
    process.exit(0)
  })
})
