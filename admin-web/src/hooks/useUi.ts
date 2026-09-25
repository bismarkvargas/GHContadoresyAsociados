import { useContext } from 'react'
import { ThemeContext } from '@/contexts/ThemeContext'
import { ToastContext } from '@/contexts/ToastContext'
import { RealtimeContext } from '@/contexts/RealtimeContext'

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime debe usarse dentro de <RealtimeProvider>')
  return ctx
}
