import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { realtime, type ConnectionStatus } from '@/api/realtime'
import { useAuth } from '@/hooks/useAuth'
import type { RealtimeEvent } from '@/api/mock/realtime-bus'

export interface RealtimeContextValue {
  status: ConnectionStatus
  lastEvent: RealtimeEvent | null
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      realtime.stop()
      return
    }
    realtime.start()
    const offStatus = realtime.onStatus(setStatus)
    const offAny = realtime.onAny((event) => {
      setLastEvent(event)
    })
    return () => {
      offStatus()
      offAny()
    }
  }, [isAuthenticated])

  /* Invalidación selectiva de caché según el evento recibido */
  useEffect(() => {
    if (!isAuthenticated) return
    const off = realtime.onAny((event) => {
      const invalidate = (key: string[]) =>
        void queryClient.invalidateQueries({ queryKey: key })

      switch (event.type) {
        case 'notification':
          invalidate(['notifications'])
          break
        case 'case.updated':
        case 'case.event':
        case 'task.completed':
        case 'task.assigned':
          invalidate(['cases'])
          invalidate(['case'])
          invalidate(['dashboard'])
          invalidate(['reports'])
          break
        case 'document.added':
          invalidate(['documents'])
          invalidate(['case'])
          break
        case 'order.updated':
        case 'payment.updated':
          invalidate(['orders'])
          invalidate(['order'])
          invalidate(['payments'])
          invalidate(['dashboard'])
          break
        case 'accountrequest.created':
          invalidate(['account-requests'])
          invalidate(['dashboard'])
          break
        case 'client.updated':
          invalidate(['clients'])
          invalidate(['client'])
          break
        case 'message.created':
          invalidate(['messages'])
          invalidate(['case'])
          break
        default:
          break
      }
    })
    return off
  }, [isAuthenticated, queryClient])

  const value = useMemo<RealtimeContextValue>(() => ({ status, lastEvent }), [status, lastEvent])

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}
