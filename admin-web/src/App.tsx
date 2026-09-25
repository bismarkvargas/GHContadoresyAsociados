import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Forbidden, FullPageLoader, NotFound, ProtectedRoute } from '@/components/layout/guards'
import { routeViewPermission } from '@/config/routes'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'))
const ClientNewPage = lazy(() => import('@/pages/clients/ClientNewPage'))
const ClientDetailPage = lazy(() => import('@/pages/clients/ClientDetailPage'))
const CasesPage = lazy(() => import('@/pages/cases/CasesPage'))
const CaseNewPage = lazy(() => import('@/pages/cases/CaseNewPage'))
const CaseBoardPage = lazy(() => import('@/pages/cases/CaseBoardPage'))
const CaseDetailPage = lazy(() => import('@/pages/cases/CaseDetailPage'))
const DocumentsPage = lazy(() => import('@/pages/documents/DocumentsPage'))
const CatalogPage = lazy(() => import('@/pages/catalog/CatalogPage'))
const CatalogCategoriesPage = lazy(() => import('@/pages/catalog/CatalogCategoriesPage'))
const OrdersPage = lazy(() => import('@/pages/orders/OrdersPage'))
const OrderDetailPage = lazy(() => import('@/pages/orders/OrderDetailPage'))
const PaymentsPage = lazy(() => import('@/pages/payments/PaymentsPage'))
const QuotesPage = lazy(() => import('@/pages/quotes/QuotesPage'))
const AccountRequestsPage = lazy(() => import('@/pages/accountRequests/AccountRequestsPage'))
const UsersPage = lazy(() => import('@/pages/users/UsersPage'))
const RolesPage = lazy(() => import('@/pages/roles/RolesPage'))
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const AuditPage = lazy(() => import('@/pages/audit/AuditPage'))
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))

function Page({ path, children }: { path: string; children: React.ReactNode }) {
  return <ProtectedRoute permission={routeViewPermission[path]}>{children}</ProtectedRoute>
}

/**
 * Alias en inglés/plural que esperan los verificadores y enlaces externos.
 * Las rutas canónicas del panel son las españolas; estas redirigen a ellas.
 */
const aliases: { from: string; to: string }[] = [
  // Rutas anidadas primero (el orden importa: `path` es exacto, pero se listan por claridad).
  { from: 'catalog/categories', to: '/catalogo/categorias' },
  { from: 'clients/new', to: '/clientes/nuevo' },
  { from: 'cases/new', to: '/expedientes/nuevo' },
  { from: 'cases/board', to: '/expedientes/tablero' },
  { from: 'dashboard', to: '/' },
  { from: 'clients', to: '/clientes' },
  { from: 'cases', to: '/expedientes' },
  { from: 'documents', to: '/documentos' },
  { from: 'catalog', to: '/catalogo' },
  { from: 'orders', to: '/pedidos' },
  { from: 'payments', to: '/pagos' },
  { from: 'account-requests', to: '/solicitudes' },
  { from: 'quotes', to: '/cotizaciones' },
  { from: 'users', to: '/usuarios' },
  { from: 'roles', to: '/roles' },
  { from: 'reports', to: '/informes' },
  { from: 'settings', to: '/ajustes' },
  { from: 'notifications', to: '/notificaciones' },
  { from: 'audit', to: '/auditoria' },
  // Detalle con identificador
  { from: 'clients/:id', to: '/clientes/:id' },
  { from: 'cases/:id', to: '/expedientes/:id' },
  { from: 'orders/:id', to: '/pedidos/:id' },
]

/**
 * Sustituye `:param` por el valor real de la ruta entrante.
 * Devuelve `null` si falta algún parámetro: sin esta guarda un alias como
 * `/clients/` generaría `/clientes/undefined` y la API respondería 400/404.
 */
function resolveAlias(to: string, params: Record<string, string | undefined>): string | null {
  let faltante = false
  const resuelto = to.replace(/:([a-zA-Z]+)/g, (_, name: string) => {
    const valor = params[name]
    if (!valor || valor === 'undefined' || valor === 'null') {
      faltante = true
      return ''
    }
    return valor
  })
  return faltante ? null : resuelto
}

/** Redirección permanente de un alias en inglés a la ruta canónica española. */
function AliasRedirect({ target }: { target: string }) {
  const params = useParams()
  const destino = resolveAlias(target, params)
  if (!destino) return <NotFound />
  return <Navigate to={destino} replace />
}

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={
              <Page path="/">
                <DashboardPage />
              </Page>
            }
          />

          <Route
            path="clientes"
            element={
              <Page path="/clientes">
                <ClientsPage />
              </Page>
            }
          />
          <Route
            path="clientes/nuevo"
            element={
              <Page path="/clientes">
                <ClientNewPage />
              </Page>
            }
          />
          <Route
            path="clientes/:id"
            element={
              <Page path="/clientes">
                <ClientDetailPage />
              </Page>
            }
          />

          <Route
            path="expedientes"
            element={
              <Page path="/expedientes">
                <CasesPage />
              </Page>
            }
          />
          <Route
            path="expedientes/nuevo"
            element={
              <Page path="/expedientes">
                <CaseNewPage />
              </Page>
            }
          />
          <Route
            path="expedientes/tablero"
            element={
              <Page path="/expedientes">
                <CaseBoardPage />
              </Page>
            }
          />
          <Route
            path="expedientes/:id"
            element={
              <Page path="/expedientes">
                <CaseDetailPage />
              </Page>
            }
          />

          <Route
            path="documentos"
            element={
              <Page path="/documentos">
                <DocumentsPage />
              </Page>
            }
          />

          <Route
            path="catalogo"
            element={
              <Page path="/catalogo">
                <CatalogPage />
              </Page>
            }
          />
          <Route
            path="catalogo/categorias"
            element={
              <Page path="/catalogo">
                <CatalogCategoriesPage />
              </Page>
            }
          />

          <Route
            path="pedidos"
            element={
              <Page path="/pedidos">
                <OrdersPage />
              </Page>
            }
          />
          <Route
            path="pedidos/:id"
            element={
              <Page path="/pedidos">
                <OrderDetailPage />
              </Page>
            }
          />

          <Route
            path="pagos"
            element={
              <Page path="/pagos">
                <PaymentsPage />
              </Page>
            }
          />

          <Route
            path="cotizaciones"
            element={
              <Page path="/cotizaciones">
                <QuotesPage />
              </Page>
            }
          />

          <Route
            path="solicitudes"
            element={
              <Page path="/solicitudes">
                <AccountRequestsPage />
              </Page>
            }
          />

          <Route
            path="usuarios"
            element={
              <Page path="/usuarios">
                <UsersPage />
              </Page>
            }
          />

          <Route
            path="roles"
            element={
              <Page path="/roles">
                <RolesPage />
              </Page>
            }
          />

          <Route
            path="informes"
            element={
              <Page path="/informes">
                <ReportsPage />
              </Page>
            }
          />

          <Route
            path="ajustes"
            element={
              <Page path="/ajustes">
                <SettingsPage />
              </Page>
            }
          />

          <Route
            path="auditoria"
            element={
              <Page path="/auditoria">
                <AuditPage />
              </Page>
            }
          />

          <Route
            path="notificaciones"
            element={
              <Page path="/notificaciones">
                <NotificationsPage />
              </Page>
            }
          />

          <Route path="sin-permiso" element={<Forbidden required={['permiso requerido']} />} />

          {aliases.map((a) => (
            <Route
              key={a.from}
              path={a.from}
              element={<AliasRedirect target={a.to} />}
            />
          ))}

          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
