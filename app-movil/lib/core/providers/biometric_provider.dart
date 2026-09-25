import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../auth/biometric_service.dart';
import '../error/api_failure.dart';
import '../storage/token_store.dart';
import 'auth_provider.dart';
import 'core_providers.dart';

/// Servicio de acceso biométrico.
///
/// Se inyecta a través de [BiometricGateway] para poder simularlo en los tests
/// sin tocar el canal de plataforma.
final biometricServiceProvider = Provider<BiometricGateway>((ref) {
  return LocalAuthBiometricService();
});

/// Estado observable del acceso con huella.
@immutable
class BiometricState {
  const BiometricState({
    this.status = BiometricStatus.checking,
    this.isEnabled = false,
    this.isChecking = true,
    this.isAuthenticating = false,
    this.notice,
    this.error,
  });

  /// Qué puede hacer la biometría en este dispositivo.
  final BiometricStatus status;

  /// ¿El usuario dejó activado el acceso con huella en este dispositivo?
  final bool isEnabled;

  /// Se está consultando al sistema (o leyendo la preferencia guardada).
  final bool isChecking;

  /// Hay un diálogo de huella en curso.
  final bool isAuthenticating;

  /// Aviso suave (por ejemplo: «se desactivó porque ya no hay huellas»).
  final String? notice;

  /// Error de la última autenticación, en español y accionable.
  final String? error;

  /// El dispositivo puede usar la huella ahora mismo.
  bool get isSupported => status.isAvailable;

  /// Cómo se llama el sensor en este dispositivo.
  String get deviceLabel => status.deviceLabel;

  /// ¿Debe mostrarse la opción de huella en el login?
  ///
  /// Depende **solo del dispositivo**: con lector y huellas registradas la opción
  /// está siempre en la pantalla de acceso, incluso si el usuario había
  /// desactivado el acceso con huella (para eso está el interruptor del perfil,
  /// que gobierna el acceso automático, no la visibilidad). El requisito del
  /// cliente es que el login biométrico nunca desaparezca por una preferencia
  /// guardada: al pulsarlo se vuelve a activar.
  bool get canUseBiometrics => status.isAvailable;

  /// ¿Se debe ofrecer activarla? Solo con lector y huellas registradas.
  bool get canOfferActivation => status.isAvailable;

  BiometricState copyWith({
    BiometricStatus? status,
    bool? isEnabled,
    bool? isChecking,
    bool? isAuthenticating,
    String? notice,
    String? error,
    bool clearNotice = false,
    bool clearError = false,
  }) =>
      BiometricState(
        status: status ?? this.status,
        isEnabled: isEnabled ?? this.isEnabled,
        isChecking: isChecking ?? this.isChecking,
        isAuthenticating: isAuthenticating ?? this.isAuthenticating,
        notice: clearNotice ? null : (notice ?? this.notice),
        error: clearError ? null : (error ?? this.error),
      );
}

/// Mensaje único cuando el dispositivo dejó de tener huellas utilizables.
const String kBiometricUnavailableNotice =
    'El acceso con huella se desactivó porque este dispositivo ya no tiene '
    'huellas disponibles. Ingrese con su contraseña.';

/// Mensaje único cuando el refresh token guardado ya no sirve.
const String kBiometricSessionExpiredNotice =
    'Su sesión expiró. Ingrese su contraseña para volver a activar la huella.';

/// Mensaje único cuando la huella no se reconoce.
const String kBiometricNotRecognizedMessage =
    'No pudimos verificar su huella. Ingrese con su contraseña.';

/// Mensaje cuando no hay ninguna sesión guardada que la huella pueda abrir.
///
/// No es un error: la huella ya se activó, solo falta el primer inicio de sesión
/// con contraseña.
const String kBiometricNoSessionMessage =
    'Ya puede entrar con su huella. Para vincularla a su cuenta, inicie sesión '
    'una vez con su correo y contraseña.';

/// Estado y operaciones del acceso con huella.
///
/// La preferencia (`gh_biometric_enabled`) y el «ya se le ofreció»
/// (`gh_biometric_offered`) se guardan en `SharedPreferences`; la sesión que
/// permite entrar sin contraseña la sigue guardando [TokenStore] en el
/// almacenamiento seguro.
class BiometricNotifier extends StateNotifier<BiometricState> {
  BiometricNotifier(this._ref) : super(const BiometricState()) {
    refresh();
  }

  final Ref _ref;

  BiometricGateway get _service => _ref.read(biometricServiceProvider);

  /// Estado actual del notificador (lectura pública para la interfaz).
  BiometricState get current => state;

  /// Cuenta el trabajo en curso para que una consulta sea cancelable cuando ya
  /// no interesa (por ejemplo: al salir del login).
  int _token = 0;

  /// El dispositivo podía usar la huella en la última consulta.
  ///
  /// La activación por defecto no se escribe en preferencias (no es una decisión
  /// del usuario), así que este recuerdo es lo que permite avisar cuando el
  /// dispositivo **pierde** la huella después de haber estado disponible.
  bool _wasAvailable = false;

  @override
  void dispose() {
    _token++;
    super.dispose();
  }

  /// Consulta el dispositivo, la cuenta con sesión guardada y quién tiene la
  /// huella habilitada.
  ///
  /// La huella solo queda **habilitada** cuando hay una sesión guardada y esa
  /// cuenta es la dueña del acceso biométrico (`gh_biometric_user_id`). Es
  /// decir: sirve para volver a entrar, nunca para entrar por primera vez. Si el
  /// dispositivo la soporta pero no está habilitada para esa cuenta, la app la
  /// ofrece.
  Future<BiometricState> refresh() async {
    final token = ++_token;
    state =
        state.copyWith(isChecking: true, clearNotice: true, clearError: true);

    final saved = await _readFlag(kBiometricEnabledKey);
    final owner = await _readUser();
    final status = await _service.status();
    if (token != _token || !mounted) return state;

    final wasAvailable = _wasAvailable;
    _wasAvailable = status.isAvailable;

    final storedUserId = await _storedUserId();
    if (token != _token || !mounted) return state;

    // Estaba habilitada para la cuenta guardada…
    final wasEnabledForUser = saved == true &&
        owner != null &&
        storedUserId != null &&
        owner == storedUserId;

    // La huella solo está habilitada si la cuenta guardada es su dueña y el
    // dispositivo puede verificarla.
    var enabled = wasEnabledForUser && status.isAvailable;

    String? notice;
    if (wasEnabledForUser && !status.isAvailable) {
      // …y el dispositivo dejó de poder usarla: se desactiva con un aviso suave,
      // sin bloquear el acceso normal.
      await _clearOwner();
      enabled = false;
      notice = kBiometricUnavailableNotice;
    } else if (saved == true && wasAvailable && !status.isAvailable) {
      // Venía habilitada y el dispositivo ya no puede usarla: se avisa igual.
      await _clearOwner();
      notice = kBiometricUnavailableNotice;
    } else if (saved == true &&
        owner != null &&
        storedUserId != null &&
        owner != storedUserId) {
      // La sesión guardada es de otra cuenta: la huella de la anterior no debe
      // abrir esta. Se limpia para poder ofrecérsela al usuario actual.
      await _clearOwner();
      enabled = false;
    }

    if (token != _token || !mounted) return state;
    state = state.copyWith(
      status: status,
      isEnabled: enabled,
      isChecking: false,
      notice: notice,
      clearNotice: notice == null,
    );
    return state;
  }

  /// Habilita el acceso con huella para la cuenta con la sesión guardada.
  ///
  /// Es el paso que sigue a un inicio de sesión con contraseña (o a la
  /// verificación exitosa de la huella). Sin sesión no hay usuario al que
  /// vincular la huella, así que devuelve `false`: la app invita a iniciar
  /// sesión primero.
  ///
  /// Devuelve `false` también si el dispositivo no puede usar la huella; en ese
  /// caso deja el motivo en [BiometricState.notice].
  Future<bool> markOwner() async {
    if (!mounted) return false;

    final userId = await _storedUserId();
    if (!mounted) return false;
    if (userId == null) {
      // Todavía no hay una cuenta con la que vincular la huella: falta el primer
      // inicio de sesión con contraseña.
      state = state.copyWith(isEnabled: false, clearError: true);
      return false;
    }

    final status = await _service.status();
    if (!mounted) return false;
    if (!status.isAvailable) {
      state = state.copyWith(
        status: status,
        isEnabled: false,
        isChecking: false,
        notice: noticeForMissingBiometrics(status),
        clearError: true,
      );
      return false;
    }

    await _writeUser(kBiometricOwnerKey, userId);
    await _writeFlag(kBiometricEnabledKey, true);
    if (!mounted) return false;
    state = state.copyWith(
      status: status,
      isEnabled: true,
      isChecking: false,
      clearNotice: true,
      clearError: true,
    );
    return true;
  }

  /// Activa o desactiva la huella para la cuenta actual.
  ///
  /// Activar sin sesión guardada devuelve `false` (no hay usuario al que
  /// vincularla). Desactivar borra el vínculo con la cuenta.
  Future<bool> setEnabled(bool enabled) async {
    if (!mounted) return false;

    if (!enabled) {
      await _clearOwner();
      if (!mounted) return false;
      state = state.copyWith(isEnabled: false, clearError: true);
      return true;
    }

    return markOwner();
  }

  /// Marca que ya se le ofreció activar la huella (se ofrece una sola vez).
  Future<void> markOffered() => _writeFlag(kBiometricOfferedKey, true);

  /// ¿Ya se le ofreció activar la huella en este dispositivo?
  ///
  /// Sin registro se asume que **no**: el ofrecimiento se hace una vez, después
  /// del primer inicio de sesión, para vincular la huella a esa cuenta.
  Future<bool> wasOffered() async =>
      (await _readFlag(kBiometricOfferedKey)) ?? false;

  /// Borra el vínculo «huella ↔ cuenta» (desactivación explícita o limpieza).
  Future<void> _clearOwner() async {
    await _writeFlag(kBiometricEnabledKey, false);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(kBiometricOwnerKey);
    } catch (e) {
      debugPrint('[Biometría] no se pudo borrar el dueño de la huella: $e');
    }
  }

  /// Id del usuario dueño de la huella habilitada, o `null` si no hay ninguno.
  Future<String?> _readUser() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final value = prefs.getString(kBiometricOwnerKey);
      return (value == null || value.isEmpty) ? null : value;
    } catch (_) {
      return null;
    }
  }

  /// Guarda qué cuenta puede entrar con la huella.
  Future<void> _writeUser(String key, String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(key, userId);
    } catch (e) {
      debugPrint('[Biometría] no se pudo guardar el dueño de la huella: $e');
    }
  }

  /// Id del usuario de la sesión guardada (aunque el access token haya vencido).
  Future<String?> _storedUserId() async {
    final store = _ref.read(tokenStoreProvider);
    await store.load();
    return store.cachedUser?.id;
  }

  /// Pide la huella. No navega ni entra: eso lo decide la pantalla.
  Future<BiometricResult> authenticate() async {
    if (!mounted) {
      return const BiometricResult.failed(BiometricFailure.unavailable);
    }
    if (state.isAuthenticating) {
      return const BiometricResult.failed(BiometricFailure.unavailable);
    }
    state = state.copyWith(isAuthenticating: true, clearError: true);

    final result = await _service.authenticate(
      reason: biometricReasonFor(state.deviceLabel),
    );
    if (!mounted) return result;

    state = state.copyWith(
      isAuthenticating: false,
      error: result.success ? null : messageForFailure(result.failure),
      clearError: result.success,
    );
    return result;
  }

  /// Deja un aviso suave para la pantalla de login.
  void setNotice(String? message) {
    if (!mounted) return;
    state = state.copyWith(
      notice: message,
      clearNotice: message == null,
    );
  }

  /// Limpia el aviso en curso (al mostrarlo o al descartarlo).
  void clearNotice() => setNotice(null);

  /// Desactiva la huella y explica por qué (sesión expirada, sin huellas…).
  Future<void> disableWithNotice(String message) async {
    await _clearOwner();
    if (!mounted) return;
    state = state.copyWith(
      isEnabled: false,
      notice: message,
      clearError: true,
    );
  }

  /// Lee una preferencia booleana distinguiendo «sin decidir» de `false`.
  ///
  /// Devuelve `null` cuando el usuario nunca ha tocado el ajuste, que es lo que
  /// permite activar la huella por defecto sin pisar una decisión explícita.
  Future<bool?> _readFlag(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (!prefs.containsKey(key)) return null;
      return prefs.getBool(key) ?? false;
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeFlag(String key, bool value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(key, value);
    } catch (e) {
      debugPrint('[Biometría] no se pudo guardar $key: $e');
    }
  }
}

/// Estado del acceso con huella.
///
/// Se mantiene vivo durante toda la sesión de la app: la marca de activación y
/// el último aviso deben sobrevivir a la navegación (el login se desmonta al
/// entrar y volver a crearlo perdería «su sesión expiró, active la huella»).
final biometricProvider =
    StateNotifierProvider<BiometricNotifier, BiometricState>((ref) {
  ref.keepAlive();
  return BiometricNotifier(ref);
});

/// ¿Ya se le ofreció activar la huella? (persistido entre arranques).
final biometricOfferedProvider = StateProvider<bool>((ref) => false);

/// Motivo en español por el que no se puede ofrecer la huella.
String noticeForMissingBiometrics(BiometricStatus status) {
  switch (status.availability) {
    case BiometricAvailability.notEnrolled:
      return 'Este dispositivo tiene lector, pero no hay huellas registradas. '
          'Registre una en los ajustes del sistema.';
    case BiometricAvailability.unavailable:
    case BiometricAvailability.ready:
      return 'Este dispositivo no tiene lector de huellas disponible.';
  }
}

/// Mensaje en español para cada causa de fallo.
///
/// La cancelación no tiene mensaje: el usuario cerró el diálogo a propósito y
/// debe quedarse en el login normal sin un error agresivo.
String? messageForFailure(BiometricFailure? failure) {
  switch (failure) {
    case null:
    case BiometricFailure.canceled:
      return null;
    case BiometricFailure.noCredentials:
      return 'Este dispositivo ya no tiene huellas registradas. '
          'Ingrese con su contraseña.';
    case BiometricFailure.unavailable:
      return 'No pudimos abrir el lector de huellas en este momento. '
          'Ingrese con su contraseña.';
    case BiometricFailure.notRecognized:
      return kBiometricNotRecognizedMessage;
  }
}

/// Texto del subtítulo del interruptor del perfil, según el estado real.
String biometricSubtitleFor(BiometricState biometric) {
  if (biometric.isChecking) return 'Comprobando el estado…';
  switch (biometric.status.availability) {
    case BiometricAvailability.ready:
      return biometric.isEnabled
          ? 'Activado en este dispositivo'
          : 'Desactivado · actívelo para entrar sin contraseña';
    case BiometricAvailability.notEnrolled:
      return 'Este dispositivo no tiene huellas registradas';
    case BiometricAvailability.unavailable:
      return 'Este dispositivo no tiene lector de huellas';
  }
}

/// Texto que invita a vincular la huella cuando todavía no está habilitada.
///
/// Se usa en el login (aviso suave) y para el diálogo que se abre después del
/// primer inicio de sesión con contraseña. Tiene que decir **dónde** iniciar
/// sesión: el formulario está más abajo, en la misma pantalla, y el aviso
/// aparece justo debajo del botón de huella.
const String kBiometricLinkMessage =
    'La huella todavía no está activada en este teléfono. Use el formulario de '
    'abajo (correo y contraseña): al entrar se le ofrecerá activarla y desde '
    'entonces podrá entrar solo con la huella.';

/// Rótulo del botón de huella del login.
///
/// Con la huella vinculada a esta cuenta ofrece entrar directo; sin vínculo,
/// invita a habilitarla. Es una función pura para poder verificarla sin árbol.
String biometricLoginLabel({
  required bool enabled,
  required String deviceLabel,
}) =>
    enabled ? 'Entrar con $deviceLabel' : 'Activar acceso con huella';

/// Motivo por el que la huella no sirve para la sesión guardada, o `null` si sí
/// sirve. Es una función pura para poder verificarla en los tests.
String? biometricLockReason({
  required bool deviceReady,
  required bool enabled,
  required bool hasStoredSession,
  required bool belongsToStoredUser,
}) {
  // Huella lista para esta cuenta y dispositivo: no hay nada que explicar.
  if (deviceReady && enabled && hasStoredSession && belongsToStoredUser) {
    return null;
  }
  // Sin sesión que desbloquear: se invita a vincular la huella. (Si además el
  // dispositivo no tiene lector, el propio estado del dispositivo ya lo explica
  // en su aviso, así que la cadena se decide por la sesión.)
  if (!hasStoredSession) return kBiometricLinkMessage;
  // Sin lector disponible y con sesión: lo explica el aviso del dispositivo.
  if (!deviceReady) return null;
  // Hay sesión pero la huella no está vinculada a ESA cuenta.
  return 'La huella está vinculada a otra cuenta en este dispositivo. Inicie '
      'sesión con su correo y contraseña para habilitarla en la suya.';
}

/// Entra con la huella ya verificada, reusando la sesión guardada.
///
/// Es el paso que sigue a [BiometricResult.success] en la pantalla de login.
/// Solo tiene sentido si la sesión guardada pertenece a la cuenta **dueña** de
/// la huella (lo garantiza [biometricLockReason] antes de pedirla):
///  * si la sesión guardada sigue siendo válida basta con `bootstrap()`;
///  * si el access token venció, se renueva con el **refresh token** guardado
///    (`apiClientProvider.refresh`) y se vuelve a guardar la sesión;
///  * si el refresh token ya no sirve, se cierra la sesión, se **desactiva** la
///    huella y se pide la contraseña con un aviso claro.
Future<BiometricLoginOutcome> loginWithBiometrics(WidgetRef ref) async {
  final store = ref.read(tokenStoreProvider);
  final auth = ref.read(authProvider.notifier);
  await store.load();

  // Sin nada guardado no hay nada que desbloquear: la huella se verifica igual
  // (la opción del login está siempre disponible), pero no hay sesión que
  // restaurar y NO se desactiva nada. Solo cuenta como sesión expirada si había
  // una sesión guardada que el servidor ya rechazó.
  if (!store.isLoggedIn && (store.refreshToken ?? '').isEmpty) {
    return const BiometricLoginOutcome(
      success: false,
      message: kBiometricNoSessionMessage,
    );
  }

  final access = store.accessToken;
  final hasValidSession =
      (access ?? '').isNotEmpty && !sessionNeedsRefresh(store.expiresAt);

  if (!hasValidSession) {
    final refreshToken = store.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) {
      return _expireBiometricSession(ref, store);
    }
    try {
      final session = await ref.read(apiClientProvider).refresh(refreshToken);
      await store.save(session);
    } on ApiFailure catch (e) {
      if (e.isUnauthorized || e.statusCode == 400) {
        return _expireBiometricSession(ref, store);
      }
      return const BiometricLoginOutcome(
        success: false,
        message:
            'No pudimos conectar con el servidor. Ingrese con su contraseña.',
      );
    } catch (_) {
      return const BiometricLoginOutcome(
        success: false,
        message: 'No pudimos validar su sesión. Ingrese con su contraseña.',
      );
    }
  }

  await auth.bootstrap();
  final stage = ref.read(authProvider).stage;

  if (stage == AuthStage.suspended || stage == AuthStage.rejected) {
    await auth.logout();
    return const BiometricLoginOutcome(
      success: false,
      message: 'Su cuenta no está habilitada. Contacte a la firma.',
    );
  }
  if (stage != AuthStage.active && stage != AuthStage.pending) {
    return _expireBiometricSession(ref, store);
  }

  return const BiometricLoginOutcome(success: true);
}

/// ¿Hace falta renovar el access token antes de usarlo?
///
/// Es una función pura para poder verificarla sin red ni almacenamiento.
@visibleForTesting
bool sessionNeedsRefresh(DateTime? expiresAt) {
  if (expiresAt == null) return true;
  return !expiresAt
      .isAfter(DateTime.now().toUtc().add(const Duration(minutes: 2)));
}

/// Cierra la sesión de huella y deja el aviso de «vuelva a activarla».
Future<BiometricLoginOutcome> _expireBiometricSession(
  WidgetRef ref,
  TokenStore store,
) async {
  await store.clear();
  await ref.read(authProvider.notifier).forceLogout();
  try {
    await ref
        .read(biometricProvider.notifier)
        .disableWithNotice(kBiometricSessionExpiredNotice);
  } catch (e) {
    debugPrint('[Biometría] no se pudo desactivar tras expirar: $e');
  }
  return const BiometricLoginOutcome(
    success: false,
    message: kBiometricSessionExpiredNotice,
    sessionExpired: true,
  );
}

/// Resultado de intentar entrar con la huella.
@immutable
class BiometricLoginOutcome {
  const BiometricLoginOutcome({
    required this.success,
    this.message,
    this.sessionExpired = false,
  });

  final bool success;

  /// Aviso que debe mostrarse cuando no se pudo entrar.
  final String? message;

  /// El refresh token ya no servía y la huella quedó desactivada.
  final bool sessionExpired;
}
