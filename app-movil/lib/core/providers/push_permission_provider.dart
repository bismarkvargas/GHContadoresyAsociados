import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../push/push_permission_service.dart';
import 'core_providers.dart';

/// Clave donde se recuerda que el usuario ya descartó el aviso de push.
///
/// Vive en `push_permission_service.dart` (el propio servicio la necesita para
/// distinguir «sin decidir» de «denegado» en Android) y se reexporta aquí para
/// quien trabaje solo con los providers.
export '../push/push_permission_service.dart' show kPushAskedKey;

/// Servicio de permiso de push (Firebase + permiso del sistema).
///
/// Se inyecta a través de [PushPermissionGateway] para poder simularlo en tests
/// sin tocar el canal de plataforma.
final pushPermissionServiceProvider = Provider<PushPermissionGateway>((ref) {
  return PushPermissionService();
});

/// Estado del permiso de notificaciones, observable por la UI.
class PushPermissionNotifier
    extends StateNotifier<AsyncValue<PushPermissionStatus>> {
  PushPermissionNotifier(this._ref)
      : super(const AsyncValue<PushPermissionStatus>.loading()) {
    refresh();
  }

  final Ref _ref;

  PushPermissionGateway get _service =>
      _ref.read(pushPermissionServiceProvider);

  /// Consulta el estado real (no pide nada).
  Future<PushPermissionStatus> refresh() async {
    final status = await _service.currentStatus();
    if (mounted) state = AsyncValue<PushPermissionStatus>.data(status);
    return status;
  }

  /// Pide el permiso al sistema.
  Future<PushPermissionStatus> request() async {
    final status = await _service.requestPermission();
    if (mounted) state = AsyncValue<PushPermissionStatus>.data(status);
    if (status.isGranted) {
      await registerToken();
    }
    return status;
  }

  /// Obtiene el token FCM y lo registra en la API (`POST /me/devices`).
  Future<String?> registerToken() async {
    return _service.registerToken(
      registrar: _ref.read(deviceTokenRegistrarProvider),
      deviceModel: _ref.read(deviceModelProvider),
    );
  }

  /// Abre los ajustes del sistema (cuando el permiso está bloqueado).
  Future<bool> openSettings() => _service.openSettings();
}

final pushPermissionProvider = StateNotifierProvider<PushPermissionNotifier,
    AsyncValue<PushPermissionStatus>>((ref) {
  return PushPermissionNotifier(ref);
});

/// Registra el token FCM con la API. Se inyecta para poder simularlo en tests.
final deviceTokenRegistrarProvider = Provider<DeviceTokenRegistrar>((ref) {
  return ({
    required String token,
    required String platform,
    String? deviceModel,
    String? appVersion,
  }) async {
    final client = ref.read(apiClientProvider);
    await client.registerDevice(
      token: token,
      platform: platform,
      deviceModel: deviceModel,
      appVersion: appVersion,
    );
  };
});

/// Modelo del dispositivo (informativo para la API).
final deviceModelProvider = Provider<String?>((ref) => null);

/// ¿Ya se le propuso activar las notificaciones? (para no insistir).
final pushAskedProvider = StateProvider<bool>((ref) => false);

/// Lee de preferencias si ya se preguntó alguna vez.
Future<bool> loadPushAsked(Ref ref) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final asked = prefs.getBool(kPushAskedKey) ?? false;
    ref.read(pushAskedProvider.notifier).state = asked;
    return asked;
  } catch (_) {
    return false;
  }
}

/// Igual que [loadPushAsked] pero desde un widget (`WidgetRef`).
Future<bool> loadPushAskedFromWidget(WidgetRef ref) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final asked = prefs.getBool(kPushAskedKey) ?? false;
    ref.read(pushAskedProvider.notifier).state = asked;
    return asked;
  } catch (_) {
    return false;
  }
}

/// Marca que ya se preguntó (al conceder o al descartar).
///
/// Acepta tanto un `Ref` de provider como un `WidgetRef` de la UI.
Future<void> markPushAsked(Ref ref) async {
  ref.read(pushAskedProvider.notifier).state = true;
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(kPushAskedKey, true);
  } catch (e) {
    debugPrint('[Push] no se pudo guardar la preferencia: $e');
  }
}

/// Igual que [markPushAsked] pero desde un widget (`WidgetRef`).
Future<void> markPushAskedFromWidget(WidgetRef ref) async {
  ref.read(pushAskedProvider.notifier).state = true;
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(kPushAskedKey, true);
  } catch (e) {
    debugPrint('[Push] no se pudo guardar la preferencia: $e');
  }
}
