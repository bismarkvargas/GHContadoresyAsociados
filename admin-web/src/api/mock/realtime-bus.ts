/**
 * Bus de eventos en vivo del modo mock.
 * El adaptador mock lo usa para publicar eventos, y MockRealtime lo alimenta
 * periódicamente para que el dashboard y la campana se muevan solos.
 */

export type RealtimeEventName =
  | 'notification'
  | 'case.updated'
  | 'case.event'
  | 'task.assigned'
  | 'task.completed'
  | 'document.added'
  | 'order.updated'
  | 'payment.updated'
  | 'message.created'
  | 'accountrequest.created'
  | 'client.updated'

export interface RealtimeEvent {
  type: RealtimeEventName
  payload: Record<string, unknown>
  at?: string
}

type Listener = (event: RealtimeEvent) => void

const listeners = new Set<Listener>()

export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitRealtime(event: RealtimeEvent): void {
  const enriched: RealtimeEvent = { ...event, at: event.at ?? new Date().toISOString() }
  for (const listener of Array.from(listeners)) {
    try {
      listener(enriched)
    } catch {
      /* un listener roto no debe romper el bus */
    }
  }
}

export function listenerCount(): number {
  return listeners.size
}
