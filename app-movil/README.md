# GH Contadores y Asociados — App móvil (Android + iOS)

App móvil híbrida en **Flutter** para la firma costarricense **GH Contadores y Asociados**
(contabilidad + trámites legales, municipales y tributarios) con **ecommerce de servicios**,
portal de cliente con expedientes, documentos, mensajería y notificaciones en tiempo real.

- **Proyecto:** `net.ghcontadores.gh_contadores`
- **Flutter:** 3.47.5 (stable) · **Dart:** 3.13.4
- **Estado y navegación:** Riverpod + go_router (5 pestañas con shell stateful)
- **API:** `/api/v1` según `docs/03-contrato-api.md`
- **Catálogo real:** 62 servicios (USD) importados desde el sitio del cliente

---

## 1. Requisitos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Flutter SDK | 3.32 o superior | Probado con 3.47.5 stable |
| Dart | 3.5 o superior | Incluido en el SDK de Flutter |
| Android Studio / SDK | API 21+ (Flutter por defecto) | Para compilar Android |
| Xcode | 15+ (solo macOS) | Para compilar iOS |
| Java | 17 | `compileOptions` de Android |

Comprueba tu entorno:

```powershell
flutter --version
flutter doctor -v
```

## 2. Cómo ejecutar

```powershell
cd C:\bismarkvargas.com\GHContadoresyAsociados\app-movil
flutter pub get

# Modo demo (por defecto): catálogo real + datos simulados, sin backend
flutter run

# Android concreto
flutter run -d <deviceId>

# iOS (solo macOS)
flutter run -d ios
```

La app arranca en **modo demo** (`useMocks = true`): navega por el catálogo real de
62 servicios, agrega al carrito, completa el checkout con la pasarela simulada, entra a
*Mis expedientes*, sube documentos y recibe notificaciones/eventos en vivo simulados.

### Cuenta demo

Cualquier correo con una contraseña de 6 o más caracteres funciona en modo demo.
La cuenta precargada es `maria.rodriguez@example.com` / `Demo1234`.

## 3. Activar / desactivar el modo demo

| Objetivo | Comando |
|---|---|
| Modo demo (por defecto) | `flutter run` |
| API real | `flutter run --dart-define=USE_MOCKS=false` |
| API real con URL propia | `flutter run --dart-define=USE_MOCKS=false --dart-define=API_BASE_URL=https://mi-servidor/api/v1` |
| APK de demostración | `flutter build apk --release` |
| APK contra producción | `flutter build apk --release --dart-define=USE_MOCKS=false --dart-define=API_BASE_URL=https://demostracion.es/ghcontadores/api/v1` |

Valores por defecto (`lib/core/config/app_config.dart`):

```dart
apiBaseUrl = 'https://demostracion.es/ghcontadores/api/v1'
useMocks   = true
```

La capa de datos tiene **dos implementaciones intercambiables por Riverpod**:

* `DioApiClient` → API real (interceptores de auth, refresh de token y conectividad).
* `MockApiClient` → modo demo completo, con el catálogo real (`assets/mock/catalog.seed.json`)
  y datos operativos coherentes: 2 expedientes, timeline, tareas, documentos, mensajes,
  pedidos, notificaciones y solicitudes de cuenta.

### Tarjetas de prueba de la pasarela simulada

| Tarjeta | Resultado |
|---|---|
| `4242 4242 4242 4242` | Pago **aprobado** → orden `InProcess`, expediente creado, carrito vaciado |
| `4000 0000 0000 0002` | Pago **rechazado** → la orden sigue `PendingPayment` y se puede reintentar |
| `4000 0000 0000 9995` | Pago **pendiente** → queda en revisión de la firma |

Los datos se validan con **Luhn** y con formateo `#### #### #### ####`; el vencimiento usa
`MM/AA` y el CVV 3–4 dígitos. SINPE Móvil y transferencia bancaria quedan `Pending` en demo
con sus instrucciones de pago.

## 4. Configurar Firebase (push FCM)

La app **arranca sin Firebase**: el servicio de push se auto-desactiva y toda la mensajería
funciona por SignalR, *polling* cada 15 s y notificaciones locales. Para activar el push real:

1. Crea el proyecto en <https://console.firebase.google.com> y añade las apps Android e iOS.
2. **Android** — descarga `google-services.json` y colócalo en:
   ```
   app-movil/android/app/google-services.json
   ```
   Añade el plugin en `android/settings.gradle.kts`:
   ```kotlin
   plugins {
       id("com.google.gms.google-services") version "4.4.2" apply false
   }
   ```
   y aplícalo en `android/app/build.gradle.kts`:
   ```kotlin
   plugins {
       id("com.google.gms.google-services")
   }
   ```
3. **iOS** — descarga `GoogleService-Info.plist` y colócalo en:
   ```
   app-movil/ios/Runner/GoogleService-Info.plist
   ```
   Ábrelo en Xcode (`ios/Runner.xcworkspace`) y **arrástralo al target Runner** para que
   quede en *Copy Bundle Resources*.
4. Descomenta las dependencias en `pubspec.yaml`:
   ```yaml
   firebase_core: ^3.3.0
   firebase_messaging: ^15.0.4
   ```
5. `flutter pub get` y, en `lib/main.dart`, inicializa Firebase (de forma tolerante a fallos) y
   marca `push.markFirebaseReady(true)` para que el token se registre con `POST /me/devices`.

> **Pendiente:** las credenciales reales de Firebase **no** están incluidas en el repositorio
> (son específicas del proyecto del cliente). Mientras no existan, el ícono de *Tiempo real*
> del perfil muestra el estado de SignalR y los avisos llegan por la bandeja in-app.

## 5. Tiempo real y notificaciones

* **SignalR** en `/hubs/realtime` con reconexión exponencial (2 s → 30 s) y suscripción a
  `user:{userId}`. Eventos soportados: `notification`, `case.updated`, `case.event`,
  `task.assigned`, `task.completed`, `document.added`, `order.updated`, `payment.updated`,
  `message.created`, `accountrequest.created`, `client.updated`.
* **Respaldo por polling** cada 15 s cuando el socket cae o cuando `useMocks = true`
  (`GET /me/notifications?since=`).
* Toda gestión del administrador se refleja **sin recargar**: el `RealtimeBridge` invalida los
  providers afectados y muestra un banner in-app.
* **Centro local:** `flutter_local_notifications` con canal `gh_contadores_default`.
* **Modo demo:** `MockRealtimeService` emite un evento cada 12 s (avance de expediente,
  documento nuevo, mensaje de la firma, tarea completada) para que el comportamiento en vivo
  sea visible sin backend. En la pantalla de cuenta pendiente hay un botón para **simular la
  aprobación del administrador**.

## 6. Compilar para distribución

### Android

```powershell
flutter build apk --release                # APK universal
flutter build appbundle --release          # AAB para Play Store
```

El APK queda en `build/app/outputs/flutter-apk/app-release.apk`. Antes de publicar:
sustituye la firma de depuración por un keystore propio en `android/app/build.gradle.kts`.

### iOS (requiere macOS + Xcode)

```bash
flutter build ipa --release
```

Genera `build/ios/ipa/*.ipa`. Recuerda configurar el *Team* y el *Bundle Identifier*
(`net.ghcontadores.ghContadores`) en `ios/Runner.xcodeproj`.

## 7. Pruebas

```powershell
flutter test          # tests de widget
flutter analyze       # análisis estático
```

Cobertura de los tests (`test/`):

| Archivo | Qué verifica |
|---|---|
| `app_startup_test.dart` | Arranque con splash de marca, onboarding de 3 diapositivas y llegada al catálogo |
| `catalog_navigation_test.dart` | Navegación al catálogo, 4 categorías reales, buscador y ficha de servicio |
| `cart_flow_test.dart` | Agregar al carrito, badge, cantidades y totales (subtotal/IVA/total) |
| `checkout_payment_test.dart` | Flujo de pago simulado **aprobado**, **rechazado** y **pendiente**, con recibo y expediente generado |

## 8. Estructura del proyecto

```
lib/
├── main.dart                     # Arranque tolerante (sesión, catálogo, push, realtime)
├── core/
│   ├── config/app_config.dart    # API_BASE_URL · USE_MOCKS · contactos reales
│   ├── error/api_failure.dart    # Mapeo de problem+json (RFC 7807)
│   ├── layout/app_shell.dart     # NavigationBar / CupertinoTabBar / NavigationRail
│   ├── mock/                     # MockApiClient + datos semilla del modo demo
│   ├── models/                   # Dominio: usuario, catálogo, expediente, documento…
│   ├── network/                  # ApiClient, DioApiClient, interceptores de auth y refresh
│   ├── providers/                # Estado Riverpod (auth, catálogo, carrito, realtime…)
│   ├── push/                     # Notificaciones locales + payload de deep link
│   ├── realtime/                 # SignalR y simulación en vivo
│   ├── router/app_router.dart    # Rutas y guardas de sesión/aprobación
│   ├── storage/token_store.dart  # flutter_secure_storage + preferencias
│   ├── theme/                    # gh_tokens.dart (marca) y gh_theme.dart (M3)
│   ├── utils/                    # Formato, validaciones (Luhn, cédula CR), estados
│   └── widgets/                  # Marca vectorial, skeletons, tarjetas, banners
└── features/
    ├── splash/ onboarding/ auth/         # Arranque, 3 slides, login, cuenta pendiente
    ├── home/                             # Saludo, accesos rápidos, gráficos, novedades
    ├── catalog/                          # Tienda, filtros, ficha + cotización
    ├── cart/ checkout/                   # Carrito y pasarela simulada
    ├── cases/ documents/ messages/        # Expedientes, documentos y mensajería
    ├── notifications/ orders/             # Bandeja y mis compras
    ├── account_request/                   # Solicitud y seguimiento por código
    └── profile/                           # Datos, preferencias, seguridad, contacto
```

## 9. Marca

Tokens en `lib/core/theme/gh_tokens.dart`, exactamente los del sitio en vivo
(`docs/01-analisis-mercado.md` §7):

| Token | Valor | Uso |
|---|---|---|
| primary | `#DF3131` | Rojo corporativo |
| primary600 | `#C42121` | Estados presionados |
| primary50 | `#FDECEC` | Fondos suaves |
| ink / ink700 | `#212121` / `#3A3A3A` | Texto |
| muted | `#646464` | Texto secundario |
| surface / surface2 | `#ECEFF3` / `#F7F8FA` | Superficies |
| border | `#E2E5E9` | Bordes |
| success / warning / danger / info | `#008250` / `#D49341` / `#E62214` / `#116DFF` | Semánticos |

Tipografía del sistema con escala 12/14/16/20/24/32, radios 10 (controles) y 16 (tarjetas),
sombra suave única, **Material 3** en claro y oscuro, transiciones Cupertino en iOS y
`CupertinoTabBar` + hojas de acción nativas, con áreas táctiles ≥ 44 px y texto escalable.

## 10. Contacto de la firma (usado en la app)

* Dirección: Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica
* Teléfonos: +506 2653 6634 · +506 8846 9454 (WhatsApp)
* Correos: `gustavo.ghcontadores@outlook.com` (gerencia) · `pedidos@ghcontadores.net` (pedidos)
* Zona horaria: `America/Costa_Rica` (UTC−6)
