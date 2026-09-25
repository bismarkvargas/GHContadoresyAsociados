import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:local_auth/local_auth.dart';

/// Clave de `SharedPreferences` donde se recuerda que el usuario activó el
/// acceso con huella en este dispositivo.
const String kBiometricEnabledKey = 'gh_biometric_enabled';

/// Clave con el **id del usuario** al que pertenece la huella activada.
///
/// El acceso biométrico no es «del teléfono» sino **de un usuario concreto**:
/// esta marca es la que permite reconocer que la huella ya está habilitada para
/// esa cuenta. Si la sesión guardada es de otro usuario, la huella no sirve para
/// esa sesión y hay que invitarlo a habilitarla para él.
const String kBiometricOwnerKey = 'gh_biometric_user_id';

/// Clave donde se recuerda que ya se le ofreció activar la huella.
///
/// El ofrecimiento se hace **una sola vez**: si dice «Ahora no» no se le vuelve
/// a insistir en cada inicio de sesión (puede activarla desde el perfil).
const String kBiometricOfferedKey = 'gh_biometric_offered';

/// Motivo que se muestra en el diálogo nativo mientras se pide la huella.
///
/// Es una función pura para poder verificarla sin canales de plataforma.
String biometricReasonFor(String deviceLabel) =>
    'Confirme su identidad con $deviceLabel para entrar a GH Contadores.';

/// Situación real de la biometría en este dispositivo.
enum BiometricAvailability {
  /// El dispositivo no tiene sensor biométrico o el sistema no lo admite.
  unavailable,

  /// Hay lector, pero el usuario no tiene ninguna huella registrada.
  notEnrolled,

  /// Hay lector y al menos una huella registrada: se puede usar.
  ready,
}

/// Retrato del estado biométrico del dispositivo.
///
/// Se calcula una sola vez por consulta y se cachea en el provider: preguntarle
/// al sistema en cada `build` costaría un viaje por el canal de plataforma y
/// haría parpadear la interfaz.
@immutable
class BiometricStatus {
  const BiometricStatus({
    required this.availability,
    this.deviceLabel = 'su huella',
  });

  /// El dispositivo no puede usar biometría (sin sensor o sin soporte).
  static const BiometricStatus unavailable =
      BiometricStatus(availability: BiometricAvailability.unavailable);

  /// Hay sensor, pero no hay huellas registradas.
  static const BiometricStatus notEnrolled =
      BiometricStatus(availability: BiometricAvailability.notEnrolled);

  /// Estado mientras se consulta al sistema.
  static const BiometricStatus checking =
      BiometricStatus(availability: BiometricAvailability.unavailable);

  final BiometricAvailability availability;

  /// Cómo se llama el sensor en este dispositivo («su huella», «Face ID»…).
  final String deviceLabel;

  bool get isAvailable => availability == BiometricAvailability.ready;
}

/// Por qué no se pudo autenticar con la huella.
enum BiometricFailure {
  /// El usuario cerró el diálogo del sistema.
  ///
  /// No es un error: se vuelve al login normal sin decir nada.
  canceled,

  /// La huella no se reconoció o el sensor falló.
  notRecognized,

  /// No hay credenciales biométricas utilizables (sin huellas, bloqueado…).
  noCredentials,

  /// El diálogo del sistema no se pudo mostrar (o el plugin no está).
  unavailable,
}

/// Resultado de pedir la huella.
@immutable
class BiometricResult {
  const BiometricResult({required this.success, this.failure});

  /// La huella se verificó correctamente.
  const BiometricResult.ok()
      : success = true,
        failure = null;

  /// No se verificó; [failure] explica por qué.
  const BiometricResult.failed(BiometricFailure reason)
      : success = false,
        failure = reason;

  final bool success;
  final BiometricFailure? failure;

  bool get isCanceled => failure == BiometricFailure.canceled;
}

/// Contrato del acceso biométrico.
///
/// Se inyecta por Riverpod ([biometricServiceProvider]) para poder sustituirlo
/// en los tests por un doble sin tocar el canal de plataforma — igual que se
/// hace con `PushPermissionGateway`.
abstract class BiometricGateway {
  /// ¿El dispositivo tiene biometría utilizable y hay huellas registradas?
  Future<bool> isAvailable();

  /// ¿Hay alguna huella registrada? (aunque el hardware no esté disponible).
  Future<bool> isEnrolled();

  /// Descripción del sensor para los textos de la interfaz.
  String get deviceLabel;

  /// Pide la huella. Nunca lanza: todo se traduce a [BiometricResult].
  Future<BiometricResult> authenticate({required String reason});

  /// Retrato del estado, con [deviceLabel] ya resuelto.
  Future<BiometricStatus> status();
}

/// Traduce lo que responde el sistema a un estado de la app.
///
/// Es una función pura: los tres caminos (sin sensor, sin huellas, listo) se
/// pueden verificar en un test sin abrir el diálogo nativo.
@visibleForTesting
BiometricStatus resolveBiometricStatus({
  required bool supported,
  required bool enrolled,
  String deviceLabel = 'su huella',
}) {
  if (!supported) {
    return BiometricStatus(
      availability: BiometricAvailability.unavailable,
      deviceLabel: deviceLabel,
    );
  }
  if (!enrolled) {
    return BiometricStatus(
      availability: BiometricAvailability.notEnrolled,
      deviceLabel: deviceLabel,
    );
  }
  return BiometricStatus(
    availability: BiometricAvailability.ready,
    deviceLabel: deviceLabel,
  );
}

/// Traduce una excepción de `local_auth` a la causa que entiende la interfaz.
///
/// `local_auth` 3.x lanza `LocalAuthException` con un código estructurado; en
/// versiones anteriores o si el canal falla puede llegar un `PlatformException`.
/// Todo lo desconocido cae en [BiometricFailure.notRecognized], que es el
/// mensaje que pide volver a la contraseña.
@visibleForTesting
BiometricFailure classifyBiometricError(Object error) {
  if (error is LocalAuthException) {
    switch (error.code) {
      case LocalAuthExceptionCode.userCanceled:
      case LocalAuthExceptionCode.systemCanceled:
      case LocalAuthExceptionCode.timeout:
      case LocalAuthExceptionCode.userRequestedFallback:
        return BiometricFailure.canceled;
      case LocalAuthExceptionCode.authInProgress:
      case LocalAuthExceptionCode.uiUnavailable:
      case LocalAuthExceptionCode.noBiometricHardware:
      case LocalAuthExceptionCode.biometricHardwareTemporarilyUnavailable:
        return BiometricFailure.unavailable;
      case LocalAuthExceptionCode.noCredentialsSet:
      case LocalAuthExceptionCode.noBiometricsEnrolled:
      case LocalAuthExceptionCode.temporaryLockout:
      case LocalAuthExceptionCode.biometricLockout:
        return BiometricFailure.noCredentials;
      case LocalAuthExceptionCode.deviceError:
      case LocalAuthExceptionCode.unknownError:
        return BiometricFailure.notRecognized;
    }
  }

  if (error is PlatformException) {
    switch (error.code) {
      case 'NotAvailable':
      case 'NotSupported':
      case 'no_biometric_hardware':
        return BiometricFailure.unavailable;
      case 'NotEnrolled':
      case 'PasscodeNotSet':
      case 'LockedOut':
      case 'PermanentlyLockedOut':
        return BiometricFailure.noCredentials;
      case 'AuthCanceled':
      case 'SystemCanceled':
      case 'UserCanceled':
        return BiometricFailure.canceled;
      default:
        return BiometricFailure.notRecognized;
    }
  }

  return BiometricFailure.notRecognized;
}

/// Implementación real del acceso biométrico con `local_auth`.
///
/// Todo es tolerante a fallos: si el plugin no está registrado (tests, escritorio
/// sin soporte) o el sistema no responde a tiempo, los métodos devuelven estados
/// «no disponible» en lugar de lanzar, y la app sigue funcionando con la
/// contraseña. El tope de tiempo evita que el arranque o el login se queden
/// esperando al canal de plataforma.
class LocalAuthBiometricService implements BiometricGateway {
  LocalAuthBiometricService({
    LocalAuthentication? auth,
    this.timeout = const Duration(seconds: 60),
    this.enrolledTimeout = const Duration(seconds: 2),
  }) : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  /// Tope para el diálogo del sistema.
  ///
  /// Tiene que ser generoso: el usuario necesita tiempo para llevar el dedo al
  /// lector, y puede fallar el primer intento y volver a probar. Un tope corto
  /// es la causa de que la huella parezca «no funcionar»: el diálogo del sistema
  /// sigue abierto y la app ya se rindió.
  final Duration timeout;

  /// Tope para las consultas de capacidades, que son casi instantáneas.
  final Duration enrolledTimeout;

  String _deviceLabel = 'su huella';

  @override
  String get deviceLabel => _deviceLabel;

  @override
  Future<bool> isAvailable() async =>
      (await status()).availability == BiometricAvailability.ready;

  @override
  Future<bool> isEnrolled() async {
    try {
      final enrolled =
          await _auth.getAvailableBiometrics().timeout(enrolledTimeout);
      _deviceLabel = biometricLabelFor(enrolled);
      return enrolled.isNotEmpty;
    } catch (e) {
      debugPrint('[Biometría] no se pudieron leer las huellas registradas: $e');
      return false;
    }
  }

  @override
  Future<BiometricStatus> status() async {
    bool supported = false;
    try {
      supported = await _auth.canCheckBiometrics.timeout(enrolledTimeout) &&
          await _auth.isDeviceSupported().timeout(enrolledTimeout);
    } catch (e) {
      // Sin plugin (tests, escritorio) o sin soporte: se trata como ausencia de
      // sensor, que es justo lo que la app debe asumir.
      debugPrint('[Biometría] dispositivo sin biometría utilizable: $e');
      supported = false;
    }

    if (!supported) {
      _deviceLabel = 'su huella';
      return BiometricStatus.unavailable;
    }

    final enrolled = await isEnrolled();
    return resolveBiometricStatus(
      supported: true,
      enrolled: enrolled,
      deviceLabel: _deviceLabel,
    );
  }

  @override
  Future<BiometricResult> authenticate({required String reason}) async {
    try {
      final ok = await _auth
          .authenticate(
            localizedReason: reason,
            // Solo biometría: el respaldo de PIN/patrón sería otro flujo y aquí
            // el usuario siempre puede volver a su contraseña de GH.
            biometricOnly: true,
            sensitiveTransaction: true,
            persistAcrossBackgrounding: true,
          )
          .timeout(timeout);

      // `false` significa que la huella no se reconoció sin efectos laterales.
      return ok
          ? const BiometricResult.ok()
          : const BiometricResult.failed(
              BiometricFailure.notRecognized,
            );
    } on TimeoutException catch (e) {
      // La app se rinde, pero el diálogo del sistema puede seguir abierto: se
      // cancela para que el siguiente intento no falle con «ya hay uno en
      // curso».
      debugPrint('[Biometría] la verificación tardó demasiado: $e');
      try {
        await _auth.stopAuthentication();
      } catch (_) {}
      return const BiometricResult.failed(BiometricFailure.canceled);
    } catch (e) {
      debugPrint('[Biometría] autenticación no completada: $e');
      return BiometricResult.failed(classifyBiometricError(e));
    }
  }
}

/// Nombre del sensor según lo que el sistema reporte como registrado.
///
/// En iOS hay una sola familia de sensores, así que `face` implica Face ID y
/// `iris` implica reconocimiento de iris. En Android los sensores faciales
/// también se reportan como `face`, así que solo se llama «huella» cuando hay
/// huellas —que es el caso habitual— y si no, se usa un texto neutro.
@visibleForTesting
String biometricLabelFor(List<BiometricType> enrolled) {
  if (enrolled.contains(BiometricType.face) &&
      !enrolled.contains(BiometricType.strong) &&
      !enrolled.contains(BiometricType.weak)) {
    return defaultTargetPlatform == TargetPlatform.iOS
        ? 'Face ID'
        : 'su rostro';
  }
  if (enrolled.contains(BiometricType.iris)) {
    return defaultTargetPlatform == TargetPlatform.iOS
        ? 'Touch ID / Face ID'
        : 'su iris';
  }
  if (enrolled.contains(BiometricType.fingerprint) ||
      enrolled.contains(BiometricType.strong) ||
      enrolled.contains(BiometricType.weak)) {
    return defaultTargetPlatform == TargetPlatform.iOS
        ? 'Touch ID'
        : 'su huella';
  }
  return 'su huella';
}
