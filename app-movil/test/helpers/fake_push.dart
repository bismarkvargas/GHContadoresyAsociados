import 'dart:async';

import 'package:gh_contadores/core/push/push_permission_service.dart';

/// Doble de prueba del permiso de push: sin canal de plataforma ni Firebase.
///
/// Permite simular los tres escenarios (sin decidir, concedido, bloqueado) y
/// comprobar que la app pide el token al conceder el permiso.
class FakePushPermissionService implements PushPermissionGateway {
  FakePushPermissionService({
    PushPermissionStatus status = PushPermissionStatus.notDetermined,
  }) : _status = status;

  PushPermissionStatus _status;

  /// Resultado que devolverá [requestPermission].
  PushPermissionStatus nextRequestResult = PushPermissionStatus.granted;

  /// Contadores para las aserciones de los tests.
  int requestCount = 0;
  int openSettingsCount = 0;
  int registerTokenCount = 0;
  int unregisterTokenCount = 0;

  /// Registradores capturados (token, plataforma).
  final List<String> registeredTokens = <String>[];

  PushPermissionStatus get status => _status;

  void setStatus(PushPermissionStatus value) => _status = value;

  @override
  Future<PushPermissionStatus> currentStatus() async => _status;

  @override
  Future<PushPermissionStatus> requestPermission() async {
    requestCount++;
    _status = nextRequestResult;
    return _status;
  }

  @override
  Future<bool> openSettings() async {
    openSettingsCount++;
    return true;
  }

  @override
  Future<String?> registerToken({
    required DeviceTokenRegistrar registrar,
    String? deviceModel,
    String? appVersion,
  }) async {
    registerTokenCount++;
    const token = 'fake-fcm-token';
    registeredTokens.add(token);
    try {
      await registrar(
        token: token,
        platform: 'android',
        deviceModel: deviceModel,
        appVersion: appVersion,
      );
    } catch (_) {
      // El registro real es tolerante a fallos; el doble también.
    }
    return token;
  }

  @override
  Future<void> unregisterToken({
    required Future<void> Function(String token) unregister,
  }) async {
    unregisterTokenCount++;
    try {
      await unregister('fake-fcm-token');
    } catch (_) {}
  }
}
