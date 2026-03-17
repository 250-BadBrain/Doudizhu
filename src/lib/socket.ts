type EventHandler = (payload?: any) => void

class RealtimeSocket {
  connected = false
  id: string | null = null

  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private readonly listeners = new Map<string, Set<EventHandler>>()
  private readonly endpoint: string

  constructor(endpoint: string) {
    this.endpoint = endpoint
    this.connect()
  }

  on(event: string, handler: EventHandler) {
    const handlers = this.listeners.get(event) ?? new Set<EventHandler>()
    handlers.add(handler)
    this.listeners.set(event, handlers)
  }

  off(event: string, handler: EventHandler) {
    const handlers = this.listeners.get(event)
    if (!handlers) {
      return
    }

    handlers.delete(handler)
    if (handlers.size === 0) {
      this.listeners.delete(event)
    }
  }

  emit(event: string, data: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    this.ws.send(JSON.stringify({ event, data }))
  }

  private connect() {
    this.ws = new WebSocket(this.endpoint)

    this.ws.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data as string) as { event?: string; data?: any }
        if (!payload.event) {
          return
        }

        if (payload.event === 'connect' && payload.data?.socketId) {
          this.id = String(payload.data.socketId)
          this.connected = true
        }

        if (payload.event === 'disconnect') {
          this.connected = false
          this.id = null
        }

        this.notify(payload.event, payload.data)
      } catch {
        // Ignore malformed payloads from network intermediaries.
      }
    }

    this.ws.onclose = () => {
      const wasConnected = this.connected
      this.connected = false
      this.id = null
      if (wasConnected) {
        this.notify('disconnect')
      }
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 1200)
  }

  private notify(event: string, data?: unknown) {
    const handlers = this.listeners.get(event)
    if (!handlers) {
      return
    }

    for (const handler of handlers) {
      handler(data)
    }
  }
}

const defaultApiUrl =
  window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://relay-doudizhu.game.h2seo4.win'

const apiUrl = import.meta.env.VITE_API_URL || defaultApiUrl
const wsUrl = toWebSocketUrl(apiUrl)

export const socket = new RealtimeSocket(wsUrl)

function toWebSocketUrl(url: string): string {
  const parsed = new URL(url)
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  parsed.pathname = '/ws'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}