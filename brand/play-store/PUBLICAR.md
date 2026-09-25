# Publicar en Google Play — paquete listo

Todo lo que pide Play Console está generado y verificado. Este documento es la lista de
entrega: qué subir, dónde está y qué falta decidir antes de pulsar «Publicar».

## 1. Archivos que se suben a Play Console

| Qué | Archivo | Tamaño / formato | Dónde se sube |
|---|---|---|---|
| **Aplicación (recomendado)** | `app-movil/build/app/outputs/bundle/release/app-release.aab` | 59,0 MB · AAB firmado | *Producción → Versiones → Crear versión* |
| Alternativa en APK | `app-movil/build/app/outputs/flutter-apk/app-release.apk` | 60,7 MB · APK firmado | Solo para pruebas internas |
| **Icono de la app** | `brand/play-store/icono-512.png` | 512×512 · PNG sin alfa | *Ficha → Ícono de la app* |
| **Gráfico destacado** | `brand/play-store/grafico-destacado-1024x500.png` | 1024×500 | *Ficha → Gráfico destacado* |
| **Capturas de teléfono** (6) | `brand/play-store/capturas/01-inicio.png` … `06-perfil.png` | 1080×2160 (1:2) | *Ficha → Capturas de teléfono* |

Todos los PNG son de 24 bits **sin transparencia** y cumplen los límites de Play
(320–3840 px y relación máxima 1:2).

## 2. Textos de la ficha

Están redactados y listos para copiar en `brand/play-store/LEEME.md`:
nombre (**GH Contadores**), descripción breve y descripción completa.

## 3. URLs obligatorias

| Requisito de Play | URL |
|---|---|
| Política de privacidad | `https://demostracion.es/ghcontadores/privacidad` |
| Términos y condiciones | `https://demostracion.es/ghcontadores/terminos` |
| Soporte / sitio web | `https://www.ghcontadores.net` |
| Correo de contacto | `pedidos@ghcontadores.net` |

Ambas páginas son públicas (no piden sesión), funcionan en claro y oscuro y están verificadas
en producción (39/39 comprobaciones automáticas).

## 4. Firma

- Keystore: `app-movil/android/keystore/gh-contadores-release.jks` (alias `ghcontadores`,
  RSA 4096, validez 30 años).
- Credenciales: `app-movil/android/keystore/LEEME-credenciales.txt` y
  `app-movil/android/key.properties`.
- Certificado del APK verificado:
  `CN=GH Contadores & Asociados, O=GH Contadores y Asociados, L=Huacas, ST=Guanacaste, C=CR`
  (SHA-256 `edc7de17…c79d9`).
- **Ninguno de esos archivos está en el repositorio** (`.gitignore`). Guárdalos en un lugar
  seguro y con copia de reserva: si se pierde el keystore no podrás publicar actualizaciones
  con la misma identidad.

### Volver a compilar cuando haya cambios

```bash
cd app-movil
export ANDROID_HOME="$LOCALAPPDATA/Android/sdk"
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
flutter build appbundle --release \
  --dart-define=USE_MOCKS=false \
  --dart-define=API_BASE_URL=https://demostracion.es/ghcontadores/api/v1
```

El AAB sale firmado automáticamente porque existe `android/key.properties`; si ese archivo no
está, la compilación usa la clave de depuración (solo para desarrollo).

## 5. Comprobaciones de Play que ya se cumplen

| Requisito | Estado |
|---|---|
| AAB firmado con clave de publicación | ✔ |
| `targetSdk` actualizado (36) | ✔ |
| Icono adaptativo (fondo azul marino + franja lima + marca blanca) | ✔ |
| Eliminación de cuenta dentro de la app | ✔ `Perfil → Eliminar mi cuenta` (`DELETE /me/profile`) |
| Política de privacidad pública | ✔ |
| Permiso de notificaciones solicitado en contexto | ✔ (`POST_NOTIFICATIONS`) |
| Sin anuncios ni compras integradas de terceros | ✔ |
| Clasificación de contenido | *Negocios / Productividad* (elegir en el formulario) |
| Cifrado en tránsito (HTTPS/TLS) | ✔ Let's Encrypt en `demostracion.es` |
| Datos declarados en *Seguridad de los datos* | Ver §6 |

## 6. Formulario «Seguridad de los datos» — qué declarar

- **Se recogen**: nombre, correo, teléfono, identificación fiscal, empresa, dirección y
  **documentos** que el usuario sube (datos personales y financieros).
- **Finalidad**: funcionalidad de la app y gestión del servicio contratado. No se usan para
  publicidad ni se comparten con terceros con fines comerciales.
- **Se comparten con terceros**: solo proveedores de infraestructura (alojamiento y
  notificaciones push) y los entes públicos ante los que se tramita, cuando el servicio lo
  exige.
- **Cifrado en tránsito**: sí. **El usuario puede solicitar el borrado**: sí, desde el perfil.
- **No** se recogen datos de ubicación precisa ni contactos.

## 7. Antes de publicar: 3 decisiones tuyas

1. **Nombre del paquete**: `net.ghcontadores.gh_contadores` (no se puede cambiar después de
   publicar; si prefieres otro, hay que cambiarlo ahora).
2. **Correo de contacto de Play**: hoy está `pedidos@ghcontadores.net`; Play exige uno
   verificado y visible públicamente.
3. **Modo de registro**: en producción está en **«con aprobación»**. Cámbialo cuando quieras
   desde **Ajustes → Registro de clientes** (registro automático o con visto bueno).

## 8. Estado verificado del sistema

| Comprobación | Resultado |
|---|---|
| Prueba de humo de la API (incluye el modo de registro en ambos modos) | **39/39** |
| Tiempo real por SignalR a través de Nginx | **11/11** |
| Panel con navegador real (Playwright) | **29/29** |
| Páginas legales | **39/39** |
| `flutter analyze` | **0 problemas** |
| `flutter test` | **24/24 en ~12 s** |
| APK firmado instalado en el teléfono | ✔ funcionando contra la API de producción |

## 9. Firebase Cloud Messaging (push) — configurado

Proyecto de Firebase: **`rutas-259514`** (cuenta `firebase-adminsdk-bec2v@rutas-259514.iam.gserviceaccount.com`).

| Pieza | Archivo | Estado |
|---|---|---|
| Servidor (enviar) | `/var/www/ghcontadores/api/firebase-service-account.json` (permisos 600) | ✔ instalado y verificado contra FCM |
| App (recibir) | `app-movil/android/app/google-services.json` | ✔ descargado, con la app Android `net.ghcontadores.gh_contadores` registrada |
| Plugin de Gradle | `com.google.gms.google-services` 4.4.4 en `settings.gradle.kts` y `app/build.gradle.kts` | ✔ activado |

**Verificación realizada**: se forzó un envío desde la API y FCM respondió
`400 The registration token is not a valid FCM registration token`. Ese error es de *token*,
no de autenticación: demuestra que el servidor obtiene el token de OAuth con la cuenta de
servicio y llega correctamente a la API v1 del proyecto.

**Las credenciales no están en el repositorio** (`.gitignore`). Para rotar la clave:

```bash
gcloud iam service-accounts keys create brand/firebase-service-account.json \
  --iam-account=firebase-adminsdk-bec2v@rutas-259514.iam.gserviceaccount.com \
  --project=rutas-259514
```

El `google-services.json` se vuelve a descargar desde
`https://console.firebase.google.com/u/0/project/rutas-259514/settings/general`
(Configuración del proyecto → Tus apps → GH Contadores → Descargar `google-services.json`).

## 10. Qué NO está incluido

- **Versión para iOS**: el proyecto Flutter es multiplataforma y la carpeta `ios/` está
  preparada (incluido el icono de 1024), pero para publicar en App Store hace falta un Mac con
  Xcode, cuenta de Apple Developer y certificado de distribución. No se ha compilado ni firmado.
