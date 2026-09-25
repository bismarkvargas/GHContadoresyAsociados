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

## 6. Acceso con huella (inicio de sesion biometrico)

El acceso con huella es **opcional** y se apoya en `local_auth` (huella en Android,
Touch ID / Face ID en iOS). Nunca sustituye a la contrasena: es un atajo para volver a
entrar en un dispositivo en el que el usuario ya inicio sesion.

### Como se activa

La huella es **de una cuenta**, no del telefono: se habilita despues de que el usuario
inicie sesion **al menos una vez** y queda vinculada a esa cuenta (`gh_biometric_user_id`).
Con eso la app reconoce quien puede entrar con huella:

* **Vinculada a la cuenta con sesion guardada** - el boton dice *Entrar con su huella* y
  entra directo (renovando la sesion con el refresh token si hacia falta).
* **Sin vincular** (o vinculada a otra cuenta) - el boton esta igual en el login, dice
  *Activar acceso con huella* y al pulsarlo **invita** a iniciar sesion con correo y
  contrasena para habilitarla. Nunca se pide la huella para abrir una cuenta ajena.

Ademas, tras el primer inicio de sesion con contrasena aparece (una sola vez) el aviso de
marca *Activar acceso con huella* para vincularla, y el interruptor del perfil permite
desvincularla o volver a vincularla.

1. El usuario inicia sesion con **correo y contrasena** (unico camino obligatorio).
2. Justo despues, y solo la primera vez, aparece el aviso de marca
   *Activar acceso con huella* con los botones **Activar huella** / **Ahora no**, para
   que confirme o descarte lo que ya viene activo. No se ofrece a invitados, ni en
   arranques en frio, ni si el dispositivo no tiene lector o no tiene huellas registradas.
3. Si acepta, la sesion guardada por `TokenStore` (tokens en `flutter_secure_storage`)
   pasa a usarse sin contrasena y la huella queda **vinculada a esa cuenta**
   (`gh_biometric_enabled` + `gh_biometric_user_id`). La clave `gh_biometric_offered`
   recuerda que ya se le ofrecio, de modo que no se insiste nunca mas.

### Como se desactiva

* **Desde el perfil** - *Mi cuenta > Acceso con huella* (`SwitchListTile`). El interruptor
  refleja el estado real y guarda la decision al apagarlo: desactivarla no se revierte sola
  en el siguiente arranque (deja de pedirse la huella automaticamente al abrir el login).
  La opcion de huella del login **no desaparece**: se puede volver a usar en cualquier momento.
* **Automaticamente** - si el dispositivo se queda sin huellas utilizables, o si el
  *refresh token* guardado deja de ser valido, la huella se desactiva y se explica el motivo.

### Que ocurre en cada caso

| Situacion | Comportamiento |
|---|---|
| Dispositivo sin sensor o sin soporte | No se ofrece la opcion; el interruptor del perfil queda deshabilitado con el motivo en el subtitulo. Si estaba activada, se desactiva con un aviso suave. |
| El dispositivo pierde las huellas (se borraron en el sistema) | Se desvincula sola y se avisa: *El acceso con huella se desactivo porque este dispositivo ya no tiene huellas disponibles*. |
| La sesion guardada es de otra cuenta | La huella de la cuenta anterior no abre la nueva: se limpia el vinculo y el login invita a habilitarla para el usuario actual. |
| Lector sin huellas registradas | No se ofrece el boton (no hay nada que verificar) y el login explica en un aviso suave que hay que registrar una huella en los ajustes del sistema. |
| El usuario cancela el dialogo | No pasa nada: se queda en el login normal, sin mensaje de error. |
| La huella no se reconoce | Aviso *No pudimos verificar su huella. Ingrese con su contrasena.* y boton **Reintentar con la huella**. |
| El refresh token caduco | Se pide la contrasena y se **desactiva** la huella con el aviso *Su sesion expiro. Ingrese su contrasena para volver a activar la huella.* |
| Huella verificada | Entra con la sesion guardada (renovandola con `POST /auth/refresh` si hacia falta) y navega al inicio o a la cuenta pendiente de aprobacion. |

### Requisitos nativos

* **Android** - `MainActivity` extiende `FlutterFragmentActivity` (lo exige `local_auth`) y
  el manifiesto declara `android.permission.USE_BIOMETRIC`.
* **iOS** - `NSFaceIDUsageDescription` en `ios/Runner/Info.plist`.
* Las cadenas de texto del dialogo del sistema las pone `biometricReasonFor(...)` en
  `lib/core/auth/biometric_service.dart`.

### Como se prueba

`test/biometric_test.dart` usa `FakeBiometricService` (`test/helpers/fake_biometric.dart`)
inyectado por `biometricServiceProvider`, de modo que no se toca el canal de plataforma:
simula dispositivo sin lector, sin huellas, huella no reconocida, cancelacion, error del
plugin y refresh token caducado.
## 7. Compilar para distribución

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

## 8. Pruebas

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

## 9. Estructura del proyecto

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

## 10. Marca

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

### Elementos activos (pestanas, botones e indicadores)

El elemento activo se marca con el **verde lima** de la marca como fondo (indicador de la
pestana, franja del TabBar, badge del carrito y de notificaciones) y el texto/icono va en
blanco. El lima nunca se usa como texto ni como icono sobre blanco: se ve mal y va contra
la regla de marca.

En `lib/core/theme/gh_theme.dart`: `navigationBarTheme`, `tabBarTheme` y
`navigationRailTheme` usan `GhTokens.accent` como indicador y blanco como color del
elemento activo. En `lib/core/layout/app_shell.dart` el badge del carrito/notificaciones
usa fondo lima con el numero en azul marino (`GhTokens.onAccent`).
## 11. Contacto de la firma (usado en la app)

* Dirección: Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica
* Teléfonos: +506 2653 6634 · +506 8846 9454 (WhatsApp)
* Correos: `gustavo.ghcontadores@outlook.com` (gerencia) · `pedidos@ghcontadores.net` (pedidos)
* Zona horaria: `America/Costa_Rica` (UTC−6)
