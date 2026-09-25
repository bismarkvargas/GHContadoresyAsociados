/**
 * MockRealtime — emisor periódico de eventos en modo mock.
 * Simula la actividad de la firma: cambios de estado de expedientes, tareas
 * completadas, nuevas solicitudes de cuenta y notificaciones para la campana.
 */

import { emitRealtime, type RealtimeEventName } from './realtime-bus'
import { getDb, persistDb, uid, userName } from './db'
import type { CaseStatus } from '@/types'

const statusCycle: CaseStatus[] = [
  'Open',
  'InProgress',
  'WaitingClient',
  'Completed',
  'OnHold',
]

const activityTitles = [
  'Se recibió documentación del cliente',
  'El ente devolvió observaciones al expediente',
  'Se coordinó reunión presencial en Huacas',
  'Se actualizó el borrador de la declaración',
  'El cliente confirmó el pago de derechos de trámite',
]

let timer: number | null = null
let tick = 0

function randomCase() {
  const db = getDb()
  if (!db.caseFiles.length) return null
  return db.caseFiles[Math.floor(Math.random() * db.caseFiles.length)] ?? null
}

/** Aplica una mutación real al mock DB y publica el evento correspondiente. */
function produceEvent(): void {
  const db = getDb()
  const roll = Math.random()

  if (roll < 0.28) {
    const c = randomCase()
    if (!c) return
    const next = statusCycle[Math.floor(Math.random() * statusCycle.length)]!
    const from = c.status
    c.status = next
    if (next === 'Completed') c.progressPercent = 100
    c.progressPercent = next === 'Completed' ? 100 : Math.min(95, c.progressPercent + 5)
    db.caseEvents.unshift({
      id: uid('evt'),
      caseFileId: c.id,
      type: 'StatusChanged',
      title: 'Cambio de estado en vivo',
      description: `${from} → ${next}`,
      actorUserId: null,
      clientVisible: true,
      metadataJson: JSON.stringify({ from, to: next }),
      createdAt: new Date().toISOString(),
    })
    persistDb()
    emitRealtime({
      type: 'case.updated',
      payload: { id: c.id, code: c.code, status: next, from },
    })
    emitRealtime({
      type: 'notification',
      payload: {
        title: 'Expediente actualizado',
        body: `${c.code} pasó a ${next}.`,
        kind: 'CaseStatusChanged',
      },
    })
    return
  }

  if (roll < 0.5) {
    const openTasks = db.caseTasks.filter((t) => t.status === 'Todo' || t.status === 'InProgress')
    if (!openTasks.length) return
    const t = openTasks[Math.floor(Math.random() * openTasks.length)]!
    t.status = 'Done'
    t.completedAt = new Date().toISOString()
    const c = db.caseFiles.find((x) => x.id === t.caseFileId)
    db.caseEvents.unshift({
      id: uid('evt'),
      caseFileId: t.caseFileId,
      type: 'TaskCompleted',
      title: 'Tarea completada en vivo',
      description: t.title,
      actorUserId: t.assignedToUserId ?? null,
      clientVisible: t.clientVisible,
      createdAt: new Date().toISOString(),
    })
    persistDb()
    emitRealtime({
      type: 'task.completed',
      payload: {
        id: t.id,
        caseFileId: t.caseFileId,
        caseCode: c?.code ?? null,
        title: t.title,
      },
    })
    emitRealtime({
      type: 'notification',
      payload: {
        title: 'Tarea completada',
        body: `${t.title}${c ? ` · ${c.code}` : ''}`,
        kind: 'TaskCompleted',
      },
    })
    return
  }

  if (roll < 0.68) {
    const names = [
      'Ricardo Alonso Bolaños Vega',
      'Stephanie Marie Oconnor',
      'Andrés Felipe Céspedes Mora',
      'Lucía Fernanda Arguedas Solís',
    ]
    const fullName = names[tick % names.length]!
    const request = {
      id: uid('areq'),
      fullName,
      email: `nueva.solicitud${tick}@correo.cr`,
      phone: `+506 8${Math.floor(1000000 + Math.random() * 8999999)}`,
      idNumber: `1-1${String(Math.floor(100 + Math.random() * 899))}-0${String(Math.floor(100 + Math.random() * 899))}`,
      clientType: (['Individual', 'Company', 'ForeignInvestor'] as const)[tick % 3]!,
      company: tick % 3 === 1 ? 'Inversiones Playa Avellanas S.A.' : null,
      message: 'Solicito información para abrir expediente de contabilidad mensual.',
      source: 'app' as const,
      status: 'Pending' as const,
      reviewedByUserId: null,
      reviewedAt: null,
      rejectionReason: null,
      createdUserId: null,
      ipAddress: '190.15.22.101',
      trackingCode: `GH-SEG-${Math.floor(100000 + Math.random() * 899999)}`,
      createdAt: new Date().toISOString(),
    }
    db.accountRequests.unshift(request)
    persistDb()
    emitRealtime({
      type: 'accountrequest.created',
      payload: { id: request.id, fullName: request.fullName },
    })
    emitRealtime({
      type: 'notification',
      payload: {
        title: 'Nueva solicitud de cuenta',
        body: `${request.fullName} solicitó acceso desde el app.`,
        kind: 'AccountApproved',
      },
    })
    return
  }

  if (roll < 0.82) {
    const c = randomCase()
    if (!c) return
    const firstStaff = db.users.find((u) => u.isStaff && u.status === 'Active')
    db.caseEvents.unshift({
      id: uid('evt'),
      caseFileId: c.id,
      type: 'Note',
      title: 'Gestión registrada',
      description: activityTitles[tick % activityTitles.length]!,
      actorUserId: firstStaff?.id ?? null,
      clientVisible: true,
      createdAt: new Date().toISOString(),
    })
    persistDb()
    emitRealtime({ type: 'case.updated', payload: { id: c.id, code: c.code } })
    return
  }

  if (roll < 0.92) {
    const paidOrder = db.orders.find((o) => o.status === 'Paid')
    if (!paidOrder) return
    paidOrder.status = 'InProcess'
    persistDb()
    emitRealtime({
      type: 'order.updated',
      payload: { id: paidOrder.id, number: paidOrder.number, status: 'InProcess' },
    })
    emitRealtime({
      type: 'notification',
      payload: {
        title: 'Pedido en proceso',
        body: `${paidOrder.number} pasó a producción.`,
        kind: 'OrderStatusChanged',
      },
    })
    return
  }

  const admin = db.users.find((u) => u.roles.includes('SuperAdmin')) ?? db.users.find((u) => u.isStaff)
  emitRealtime({
    type: 'notification' as RealtimeEventName,
    payload: {
      title: 'Actividad del sistema',
      body: `Verificación automática completada por ${userName(admin?.id)} en el turno en curso.`,
      kind: 'System',
    },
  })
}

/** Arranca el emisor. `intervalMs` por defecto 12 s. */
export function startMockRealtime(intervalMs = 12000): () => void {
  if (timer !== null) return stopMockRealtime
  timer = window.setInterval(() => {
    tick += 1
    try {
      produceEvent()
    } catch {
      /* el emisor nunca debe romper la app */
    }
  }, intervalMs)
  return stopMockRealtime
}

export function stopMockRealtime(): void {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}
