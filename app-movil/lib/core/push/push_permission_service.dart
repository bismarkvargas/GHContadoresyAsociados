import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Clave donde se recuerda que ya se propuso activar las notificaciones.
///
/// En Android es la única forma de distinguir «aún no se le ha preguntado» de
/// «denegó»: el sistema no lo expone y `firebase_messaging` reporta `denied` en
/// ambos casos.
const String kPushAskedKey = 'gh_push_permission_asked';

/// Estado del permiso de notificaciones push.
enum PushPermissionStatus {
  /// El usuario aún no ha decidido (Android 13+ / iOS).
  notDetermined,

  /// Permiso concedido: el sistema mostrará las notificaciones.
  granted,

  /// Denegado por el usuario (puede volver a pedirse o abrirse ajustes).
  denied,

  /// Bloqueado: el sistema ya no muestra el diálogo, hay que ir a ajustes.
  permanentlyDenied,

  /// Push no disponible en este dispositivo (sin Google Play Services,
  /// Firebase sin inicializar, complemento ausente…).
  unavailable,
}

extension PushPermissionStatusX on PushPermissionStatus {
  bool get isGranted => this == PushPermissionStatus.granted;
  bool get canRequest =>
      this == PushPermissionStatus.notDetermined ||
      this == PushPermissionStatus.denied;
  bool get needsSettings => this == PushPermissionStatus.permanentlyDenied;
  bool get isDenied =>
      this == PushPermissionStatus.denied ||
      this == PushPermissionStatus.permanentlyDenied;
}

/// Registra el token FCM con la API (`POST /me/devices`).
typedef DeviceTokenRegistrar = Future<void> Function({
  required String token,
  required String platform,
  String? deviceModel,
  String? appVersion,
});

/// Contrato del permiso de push.
///
/// Permite inyectar una implementación de prueba en los tests sin tocar el
/// canal de plataforma.
abstract class PushPermissionGateway {
  /// Estado actual del permiso, sin pedirlo.
  Future<PushPermissionStatus> currentStatus();

  /// Pide el permiso al sistema.
  Future<PushPermissionStatus> requestPermission();

  /// Abre los ajustes del sistema para esta aplicación.
  Future<bool> openSettings();

  /// Obtiene el token FCM y lo registra en la API.
  Future<String?> registerToken({
    required DeviceTokenRegistrar registrar,
    String? deviceModel,
    String? appVersion,
  });

  /// Da de baja el token en la API (al cerrar sesión).
  Future<void> unregisterToken({
    required Future<void> Function(String token) unregister,
  });
}

/// Traduce el permiso de Android al estado que usa la app.
///
/// Android no distingue «nunca se preguntó» de «denegado»: `denied` significa
/// simplemente que las notificaciones no están activas. Como el diálogo del
/// sistema solo se puede ofrecer con sentido una vez, el registro local
/// (`askedBefore`) decide si aún procede proponerlo.
///
/// Es una función pura para poder verificarla sin canales de plataforma.
@visibleForTesting
PushPermissionStatus resolveAndroidStatus({
  required PermissionStatus permission,
  required bool askedBefore,
}) {
  if (permission.isGranted || permission.isLimited || permission.isProvisional) {
    return PushPermissionStatus.granted;
  }
  if (permission.isPermanentlyDenied || permission.isRestricted) {
    return PushPermissionStatus.permanentlyDenied;
  }
  return askedBefore
      ? PushPermissionStatus.denied
      : PushPermissionStatus.notDetermined;
}

/// Permiso de notificaciones push + obtención y registro del token FCM.
///
/// Todo es tolerante a fallos: si Firebase no está inicializado (dispositivo
/// sin Google Play Services, proyecto sin configurar o tests) los métodos
/// devuelven [PushPermissionStatus.unavailable] y la app sigue funcionando sin
/// push, sin errores visibles para el usuario.
class PushPermissionService implements PushPermissionGateway {
  PushPermissionService();

  bool _firebaseReady = false;
  bool _initAttempted = false;
  String? _lastToken;

  /// Token FCM obtenido (para depuración y para re-registrar tras el login).
  String? get lastToken => _lastToken;

  bool get firebaseReady => _firebaseReady;

  /// Inicializa Firebase una sola vez y de forma tolerante.
  ///
  /// Devuelve `true` si quedó listo. Nunca lanza ni bloquea el arranque.
  Future<bool> ensureFirebaseInitialized() async {
    if (_firebaseReady) return true;
    if (_initAttempted) return false;
    _initAttempted = true;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
      _firebaseReady = true;
      debugPrint('[Push] Firebase inicializado');
    } catch (e) {
      _firebaseReady = false;
      debugPrint('[Push] Firebase no disponible (push desactivado): $e');
    }
    return _firebaseReady;
  }

  /// Estado actual del permiso, sin pedirlo.
  ///
  /// En Android se consulta primero con `permission_handler`: el complemento de
  /// Firebase solo mira `areNotificationsEnabled()` y devuelve `denied` tanto si
  /// el usuario denegó como si nunca se le preguntó, lo que impediría ofrecer el
  /// aviso previo y gastaría el único diálogo del sistema sin contexto.
  @override
  Future<PushPermissionStatus> currentStatus() async {
    if (!await ensureFirebaseInitialized()) {
      return PushPermissionStatus.unavailable;
    }
    try {
      final android = await _androidStatus();
      if (android != null) return android;
      final settings =
          await FirebaseMessaging.instance.getNotificationSettings();
      return _mapStatus(settings.authorizationStatus);
    } catch (e) {
      debugPrint('[Push] no se pudo leer el estado del permiso: $e');
      return PushPermissionStatus.unavailable;
    }
  }

  /// Estado del permiso en Android (donde «sin decidir» no existe como tal).
  ///
  /// Devuelve `null` fuera de Android o si no se puede consultar, para que el
  /// llamador use el estado de `firebase_messaging`.
  Future<PushPermissionStatus?> _androidStatus() async {
    if (defaultTargetPlatform != TargetPlatform.android) return null;
    try {
      final status = await Permission.notification.status;
      return resolveAndroidStatus(
        permission: status,
        askedBefore: await _alreadyAsked(),
      );
    } catch (e) {
      debugPrint('[Push] no se pudo consultar el permiso de Android: $e');
      return null;
    }
  }

  /// ¿Ya se le propuso activar las notificaciones en este dispositivo?
  Future<bool> _alreadyAsked() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(kPushAskedKey) ?? false;
    } catch (_) {
      // Sin preferencias se asume que ya se preguntó: es más prudente no
      // gastar el diálogo del sistema por segunda vez.
      return true;
    }
  }

  /// Pide el permiso al sistema (alert, badge y sound).
  ///
  /// En Android 13+ es el diálogo de `POST_NOTIFICATIONS`; en iOS el de APNs
  /// (Firebase Messaging ya lo abstrae).
  @override
  Future<PushPermissionStatus> requestPermission() async {
    if (!await ensureFirebaseInitialized()) {
      return PushPermissionStatus.unavailable;
    }
    try {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      final status = _mapStatus(settings.authorizationStatus);
      debugPrint('[Push] resultado del permiso: ${settings.authorizationStatus}');
      return status;
    } catch (e) {
      debugPrint('[Push] error al pedir el permiso: $e');
      return PushPermissionStatus.unavailable;
    }
  }

  /// Abre los ajustes del sistema para esta app.
  ///
  /// Es la única salida cuando el permiso está bloqueado (Android no vuelve a
  /// mostrar el diálogo tras una denegación definitiva).
  @override
  Future<bool> openSettings() async {
    try {
      return await openAppSettings();
    } catch (e) {
      debugPrint('[Push] no se pudieron abrir los ajustes: $e');
      return false;
    }
  }

  /// Obtiene el token FCM y lo registra en la API.
  ///
  /// Se llama al conceder el permiso y en cada login (para asegurar que el
  /// dispositivo queda asociado al usuario).
  @override
  Future<String?> registerToken({
    required DeviceTokenRegistrar registrar,
    String? deviceModel,
    String? appVersion,
  }) async {
    if (!await ensureFirebaseInitialized()) return null;
    try {
      // En iOS el token de APNs debe estar listo antes de pedir el de FCM.
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null || token.isEmpty) {
        debugPrint('[Push] FCM no devolvió token');
        return null;
      }
      _lastToken = token;
      await registrar(
        token: token,
        platform: _platformName(),
        deviceModel: deviceModel,
        appVersion: appVersion,
      );
      debugPrint('[Push] token registrado en la API');
      return token;
    } catch (e) {
      debugPrint('[Push] no se pudo registrar el token: $e');
      return null;
    }
  }

  /// Elimina el token del servidor (al cerrar sesión o eliminar la cuenta).
  @override
  Future<void> unregisterToken({
    required Future<void> Function(String token) unregister,
  }) async {
    final token = _lastToken;
    if (token == null) return;
    try {
      await unregister(token);
      _lastToken = null;
    } catch (e) {
      debugPrint('[Push] no se pudo dar de baja el token: $e');
    }
  }

  static PushPermissionStatus _mapStatus(AuthorizationStatus status) {
    switch (status) {
      case AuthorizationStatus.authorized:
      case AuthorizationStatus.provisional:
        return PushPermissionStatus.granted;
      case AuthorizationStatus.denied:
        return PushPermissionStatus.denied;
      case AuthorizationStatus.notDetermined:
        return PushPermissionStatus.notDetermined;
    }
  }

  static String _platformName() {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'android';
      case TargetPlatform.iOS:
        return 'ios';
      default:
        return 'web';
    }
  }
}
