/**
 * Cliente de tiempo real.
 * - Con backend real: SignalR en /hubs/realtime (JWT por query string).
 * - Con VITE_USE_MOCKS=true: MockRealtime + polling de respaldo cada 15 s.
 * En ambos casos la UI se suscribe por nombre de evento.
 */

import * as signalR from '@microsoft/signalr'
import { USE_MOCKS, tokenStore } from './client'
import { subscribeRealtime, type RealtimeEvent, type RealtimeEventName } from './mock/realtime-bus'
import { startMockRealtime, stopMockRealtime } from './mock/MockRealtime'
import { notificationsApi } from './endpoints'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'mock'

type Handler = (payload: Record<string, unknown>) => void
type StatusHandler = (status: ConnectionStatus) => void

const SERVER_EVENTS: RealtimeEventName[] = [
  'notification',
  'case.updated',
  'case.event',
  'task.assigned',
  'task.completed',
  'document.added',
  'order.updated',
  'payment.updated',
  'message.created',
  'accountrequest.created',
  'client.updated',
]

class RealtimeClient {
  private handlers = new Map<string, Set<Handler>>()
  private statusHandlers = new Set<StatusHandler>()
  private connection: signalR.HubConnection | null = null
  private unsubscribeMock: (() => void) | null = null
  private pollTimer: number | null = null
  private lastPollAt: string | null = null
  private started = false
  private status: ConnectionStatus = 'disconnected'

  get currentStatus(): ConnectionStatus {
    return this.status
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return
    this.status = status
    for (const handler of Array.from(this.statusHandlers)) handler(status)
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler)
    handler(this.status)
    return () => {
      this.statusHandlers.delete(handler)
    }
  }

  /** Suscribe un manejador a un evento del servidor. Devuelve el desuscriptor. */
  on(event: RealtimeEventName, handler: Handler): () => void {
    const set = this.handlers.get(event) ?? new Set<Handler>()
    set.add(handler)
    this.handlers.set(event, set)
    return () => {
      set.delete(handler)
    }
  }

  /** Suscribe un manejador a todos los eventos del servidor. */
  onAny(handler: (event: RealtimeEvent) => void): () => void {
    return subscribeToAll(this, handler)
  }

  private dispatch(type: string, payload: Record<string, unknown>): void {
    const set = this.handlers.get(type)
    if (!set) return
    for (const handler of Array.from(set)) {
      try {
        handler(payload)
      } catch {
        /* un manejador con error no debe tumbar el socket */
      }
    }
  }

  /** Arranca la conexión (idempotente). */
  start(): void {
    if (this.started) return
    this.started = true

    if (USE_MOCKS) {
      this.setStatus('mock')
      this.unsubscribeMock = subscribeRealtime((event) => {
        this.dispatch(event.type, event.payload)
      })
      startMockRealtime(12000)
      this.startPolling()
      return
    }

    const hubUrl = (import.meta.env.VITE_HUB_URL as string | undefined) ?? '/ghcontadores/hubs/realtime'
    this.setStatus('connecting')
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${hubUrl}?access_token=${encodeURIComponent(tokenStore.access ?? '')}`)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    for (const event of SERVER_EVENTS) {
      connection.on(event, (payload: Record<string, unknown>) => this.dispatch(event, payload ?? {}))
    }

    connection.onreconnecting(() => this.setStatus('reconnecting'))
    connection.onreconnected(() => this.setStatus('connected'))
    connection.onclose(() => {
      this.setStatus('disconnected')
      this.startPolling()
    })

    connection
      .start()
      .then(() => this.setStatus('connected'))
      .catch(() => {
        this.setStatus('disconnected')
        this.startPolling()
      })

    this.connection = connection
  }

  /** Polling de respaldo cada 15 s (también usado por SignalR caído). */
  private startPolling(intervalMs = 15000): void {
    if (this.pollTimer !== null) return
    this.pollTimer = window.setInterval(() => {
      void this.poll()
    }, intervalMs)
  }

  private async poll(): Promise<void> {
    try {
      if (USE_MOCKS) {
        // El emisor mock ya muta los datos; el polling fuerza refresco de la campana.
        this.dispatch('notification', { source: 'poll' })
        return
      }
      const data = await notificationsApi.list({ page: 1, pageSize: 10 })
      for (const item of data.items) {
        if (this.lastPollAt && new Date(item.createdAt).getTime() <= new Date(this.lastPollAt).getTime()) {
          continue
        }
        this.dispatch('notification', {
          id: item.id,
          title: item.title,
          body: item.body,
          type: item.type,
        })
      }
      this.lastPollAt = data.items[0]?.createdAt ?? new Date().toISOString()
    } catch {
      /* silencioso: el polling es best-effort */
    }
  }

  /** Detiene todo y libera recursos. */
  stop(): void {
    this.started = false
    this.unsubscribeMock?.()
    this.unsubscribeMock = null
    stopMockRealtime()
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.connection) {
      void this.connection.stop().catch(() => undefined)
      this.connection = null
    }
    this.setStatus('disconnected')
  }
}

function subscribeToAll(client: RealtimeClient, handler: (event: RealtimeEvent) => void): () => void {
  const disposers = SERVER_EVENTS.map((event) =>
    client.on(event, (payload) => handler({ type: event, payload })),
  )
  return () => disposers.forEach((d) => d())
}

export const realtime = new RealtimeClient()
