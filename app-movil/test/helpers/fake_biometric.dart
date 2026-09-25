import 'dart:async';

import 'package:gh_contadores/core/auth/biometric_service.dart';
import 'package:local_auth/local_auth.dart';

/// Doble de prueba del acceso biométrico: sin canal de plataforma.
///
/// Permite simular los tres escenarios del dispositivo (sin lector, sin huellas
/// registradas y listo) y los tres resultados de la autenticación (verificada,
/// no reconocida y cancelada por el usuario), además de un error de plataforma
/// arbitrario. Con él se comprueba todo el flujo —ofrecimiento, login con
/// huella, avisos y fallos— sin abrir ningún diálogo del sistema.
class FakeBiometricService implements BiometricGateway {
  FakeBiometricService({
    this.availability = BiometricAvailability.ready,
    this.label = 'su huella',
  });

  /// Dispositivo sin lector biométrico (o sin soporte del sistema).
  FakeBiometricService.unavailable()
      : availability = BiometricAvailability.unavailable,
        label = 'su huella';

  /// Dispositivo con lector, pero sin huellas registradas.
  FakeBiometricService.notEnrolled({this.label = 'su huella'})
      : availability = BiometricAvailability.notEnrolled;

  /// Qué debe responder [status] / [isAvailable] / [isEnrolled].
  BiometricAvailability availability;

  /// Nombre del sensor que usará la interfaz («su huella», «Face ID»…).
  String label;

  /// Resultado de la siguiente llamada a [authenticate].
  BiometricResult nextResult = const BiometricResult.ok();

  /// Cola de resultados para llamadas sucesivas.
  ///
  /// Si está vacía se usa siempre [nextResult]; con valores, se van consumiendo
  /// en orden y el último se repite.
  final List<BiometricResult> results = <BiometricResult>[];

  /// Si no es `null`, [authenticate] lo lanza en lugar de devolver un resultado.
  ///
  /// Sirve para verificar que un fallo del plugin (p. ej. `PlatformException`)
  /// también cae al login normal.
  Object? authError;

  /// Modo «no interactivo»: [authenticate] queda pendiente hasta que el test lo
  /// resuelva con [resolveAuthentication].
  ///
  /// Reproduce lo que pasa en un teléfono real: mientras el sistema muestra el
  /// diálogo de huella, la llamada sigue en curso y la pantalla no navega.
  bool nonInteractive = false;

  Completer<BiometricResult>? _pending;

  /// Completa la autenticación en curso (modo no interactivo).
  void resolveAuthentication([BiometricResult? result]) {
    final pending = _pending;
    if (pending == null || pending.isCompleted) return;
    pending.complete(result ?? const BiometricResult.ok());
  }

  /// Motivo recibido en la última llamada a [authenticate] (para comprobar que
  /// el texto es el que espera [biometricReasonFor]).
  String? lastReason;

  /// Contadores para las aserciones de los tests.
  int statusCount = 0;
  int availableCount = 0;
  int enrolledCount = 0;
  int authenticateCount = 0;

  List<BiometricType> _enrolledTypes() {
    switch (availability) {
      case BiometricAvailability.ready:
        return const <BiometricType>[BiometricType.fingerprint];
      case BiometricAvailability.notEnrolled:
      case BiometricAvailability.unavailable:
        return const <BiometricType>[];
    }
  }

  /// Cambia el estado del dispositivo simulando otra consulta del sistema.
  void setAvailability(BiometricAvailability value) => availability = value;

  /// Deja la huella como no reconocida en la siguiente llamada.
  void denyNext() =>
      nextResult = const BiometricResult.failed(BiometricFailure.notRecognized);

  /// Deja la siguiente llamada como cancelada por el usuario.
  void cancelNext() =>
      nextResult = const BiometricResult.failed(BiometricFailure.canceled);

  @override
  String get deviceLabel => label;

  @override
  Future<bool> isAvailable() async {
    availableCount++;
    return availability == BiometricAvailability.ready;
  }

  @override
  Future<bool> isEnrolled() async {
    enrolledCount++;
    return _enrolledTypes().isNotEmpty;
  }

  @override
  Future<BiometricStatus> status() async {
    statusCount++;
    return resolveBiometricStatus(
      supported: availability != BiometricAvailability.unavailable,
      enrolled: availability == BiometricAvailability.ready,
      deviceLabel: label,
    );
  }

  @override
  Future<BiometricResult> authenticate({required String reason}) async {
    authenticateCount++;
    lastReason = reason;

    final error = authError;
    if (error != null) {
      // Se traduce igual que la implementación real: así el test cubre el
      // mismo camino de clasificación de errores.
      return BiometricResult.failed(classifyBiometricError(error));
    }

    if (nonInteractive) {
      _pending = Completer<BiometricResult>();
      return _pending!.future;
    }

    if (results.isEmpty) return nextResult;
    if (results.length == 1) return results.first;
    return results.removeAt(0);
  }
}
