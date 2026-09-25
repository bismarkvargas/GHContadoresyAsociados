import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/biometric_service.dart';
import '../providers/biometric_provider.dart';
import '../providers/core_providers.dart';
import '../theme/gh_tokens.dart';
import 'gh_common.dart';
import 'gh_logo.dart';

/// Diálogo de marca que ofrece activar el acceso con huella.
///
/// Se muestra **una sola vez** y solo después de un inicio de sesión con
/// contraseña: la sesión (tokens) ya está guardada por `TokenStore`, de modo
/// que aceptar es únicamente marcar la preferencia.
///
/// Recibe [notifier] ya resuelto (y no el `ref` del widget) porque el login se
/// desmonta justo después de iniciar sesión: si se volviera a leer el provider
/// cuando el diálogo se cierra, el notificador podría estar ya desechado y la
/// marca no llegaría a guardarse.
///
/// Devuelve `true` si el usuario aceptó activar la huella.
Future<bool> showBiometricEnableDialog(
  BuildContext context,
  BiometricNotifier notifier, {
  String? deviceLabel,
}) async {
  final label = deviceLabel ?? notifier.current.deviceLabel;

  final accepted = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) {
      final theme = Theme.of(dialogContext);
      return AlertDialog(
        key: const Key('biometric-enable-dialog'),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24),
        contentPadding: EdgeInsets.zero,
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            // Franja lima superior: rasgo de marca dentro del diálogo.
            const GhTopStripe(includeSafeArea: false, height: 4),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 22, 24, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      color: GhTokens.primary50,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: GhTokens.accent.withValues(alpha: 0.6),
                        width: 3,
                      ),
                    ),
                    child: const Icon(
                      Icons.fingerprint_rounded,
                      size: 34,
                      color: GhTokens.primary,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const GhLogoImage(height: 30),
                  const SizedBox(height: 14),
                  Text(
                    'Activar acceso con huella',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Entre a GH Contadores con $label, sin escribir su '
                    'contraseña. Su sesión queda guardada solo en este '
                    'dispositivo.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const _BiometricBenefit(
                    icon: Icons.bolt_rounded,
                    text: 'Acceso inmediato a sus trámites y documentos',
                  ),
                  const _BiometricBenefit(
                    icon: Icons.lock_outline_rounded,
                    text: 'La huella nunca sale de su dispositivo',
                  ),
                  const _BiometricBenefit(
                    icon: Icons.password_rounded,
                    text: 'La contraseña siempre sigue funcionando',
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
              child: Column(
                children: <Widget>[
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      key: const Key('biometric-dialog-activate'),
                      onPressed: () => Navigator.of(dialogContext).pop(true),
                      icon: const Icon(Icons.fingerprint_rounded, size: 18),
                      label: const Text('Activar huella'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      key: const Key('biometric-dialog-later'),
                      onPressed: () => Navigator.of(dialogContext).pop(false),
                      child: const Text('Ahora no'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );

  if (accepted != true) return false;

  // La sesión ya está guardada: se vincula la huella a **esta cuenta**.
  final ok = await notifier.markOwner();
  if (!context.mounted) return ok;

  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? 'Listo. La próxima vez puede entrar con $label.'
              : noticeForMissingBiometrics(notifier.current.status),
        ),
      ),
    );
  return ok;
}

/// Botón destacado con la huella para entrar sin contraseña.
///
/// Se pinta siempre que el dispositivo tenga lector y huellas registradas:
/// cuando la huella ya está vinculada a la cuenta entra directo, y cuando
/// todavía no lo está invita a habilitarla con el correo y la contraseña.
class BiometricLoginButton extends ConsumerWidget {
  const BiometricLoginButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final biometric = ref.watch(biometricProvider);
    if (!biometric.canUseBiometrics) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final busy = biometric.isAuthenticating;
    // Tras un fallo se ofrece reintentar explícitamente junto al botón.
    final retry = biometric.error != null;
    final linked = biometric.isEnabled;

    return Column(
      children: <Widget>[
        const SizedBox(height: 4),
        if (retry)
          TextButton.icon(
            key: const Key('login-biometric-retry'),
            onPressed: busy
                ? null
                : () => attemptBiometricLogin(context, ref, automatic: false),
            icon: const Icon(Icons.refresh_rounded, size: 16),
            label: const Text('Reintentar con la huella'),
          ),
        if (retry) const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            key: const Key('login-biometric-button'),
            onPressed: busy ? null : () => attemptBiometricLogin(context, ref),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(GhTokens.minTouchTarget),
              foregroundColor: theme.colorScheme.primary,
              side: BorderSide(
                color:
                    retry ? theme.colorScheme.error : theme.colorScheme.primary,
                width: retry ? 1.8 : 1.4,
              ),
            ),
            icon: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2.2),
                  )
                : const Icon(Icons.fingerprint_rounded, size: 26),
            label: Text(
              busy
                  ? 'Verificando su huella…'
                  // Sin huella vinculada a esta cuenta, el botón invita a
                  // habilitarla (con el correo y la contraseña).
                  : biometricLoginLabel(
                      enabled: linked,
                      deviceLabel: biometric.deviceLabel,
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

/// ¿Hay una sesión guardada (aunque el access token haya vencido)?
bool hasStoredSession(WidgetRef ref) {
  final store = ref.read(tokenStoreProvider);
  return store.isLoggedIn || (store.refreshToken ?? '').isNotEmpty;
}

/// Aviso que pide la pantalla de login cuando hay que usar el formulario.
///
/// Lo dispara el botón de huella si la huella todavía no está vinculada: el
/// mensaje solo no basta, hay que **llevar al usuario al formulario** de correo
/// y contraseña que está más abajo en la misma pantalla.
VoidCallback? onBiometricNeedsPasswordForm;

/// Explica por qué la huella no sirve todavía para la sesión guardada.
///
/// Devuelve `null` cuando no hay nada que explicar (dispositivo sin lector, o
/// huella ya habilitada para esta cuenta).
String? biometricLockReasonFor(WidgetRef ref) {
  final store = ref.read(tokenStoreProvider);
  final biometric = ref.read(biometricProvider);
  return biometricLockReason(
    deviceReady: biometric.status.isAvailable,
    enabled: biometric.isEnabled,
    hasStoredSession: store.isLoggedIn || (store.refreshToken ?? '').isNotEmpty,
    // El estado ya valida el dueño: si está habilitada, es de esta cuenta.
    belongsToStoredUser: biometric.isEnabled,
  );
}

/// Verifica la huella y, si es correcta, entra con la sesión guardada.
///
/// Cualquier fallo deja al usuario en el login normal (correo + contraseña)
/// con un mensaje claro; la cancelación no muestra nada.
Future<bool> attemptBiometricLogin(
  BuildContext context,
  WidgetRef ref, {
  bool automatic = false,
}) async {
  // Si la huella todavía no está vinculada a la cuenta guardada (o no hay
  // sesión), no se pide al sistema: se invita a iniciar sesión con la contraseña
  // para habilitarla. Así la huella nunca intenta abrir una cuenta ajena.
  final reason = biometricLockReasonFor(ref);
  if (reason != null) {
    ref.read(biometricProvider.notifier).setNotice(reason);
    // Y se lleva al usuario al formulario, que es lo que tiene que hacer. Se
    // invoca solo si el contexto que lo registró sigue vivo: el callback apunta
    // a la pantalla de login y pudo desmontarse.
    if (context.mounted) onBiometricNeedsPasswordForm?.call();
    return false;
  }

  final notifier = ref.read(biometricProvider.notifier);
  final result = await notifier.authenticate();
  if (!context.mounted) return false;

  if (result.isCanceled) return false;

  if (!result.success) {
    // El mensaje ya quedó en el estado del provider; se muestra como aviso.
    return false;
  }

  // Huella verificada: queda vinculada a la cuenta de la sesión guardada.
  if (!notifier.current.isEnabled) {
    await notifier.markOwner();
  }
  if (!context.mounted) return false;

  final outcome = await loginWithBiometrics(ref);
  if (!context.mounted) return false;

  if (!outcome.success) {
    if (outcome.message != null) {
      ref.read(biometricProvider.notifier).setNotice(outcome.message);
    }
    return false;
  }
  return true;
}

class _BiometricBenefit extends StatelessWidget {
  const _BiometricBenefit({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: <Widget>[
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: GhTokens.accent50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 14, color: GhTokens.primary700),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: theme.textTheme.bodySmall),
          ),
        ],
      ),
    );
  }
}

/// Aviso suave de la pantalla de login (biometría desactivada, sesión expirada).
class BiometricLoginNotice extends ConsumerWidget {
  const BiometricLoginNotice({super.key, this.margin = EdgeInsets.zero});

  final EdgeInsets margin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(biometricProvider);
    var message = state.error ?? state.notice;

    // Un solo caso más merece explicación en el login: el teléfono tiene lector
    // pero ninguna huella registrada. Sin esto, el usuario no ve el botón de
    // huella y no sabe por qué.
    if (message == null &&
        state.status.availability == BiometricAvailability.notEnrolled) {
      message = 'Su teléfono tiene lector de huellas, pero aún no hay ninguna '
          'registrada. Agréguela en los ajustes del sistema para entrar con la '
          'huella.';
    }
    if (message == null) return const SizedBox.shrink();

    return Padding(
      padding: margin,
      child: GhInlineNotice(
        key: const Key('login-biometric-notice'),
        title: state.error != null
            ? 'No pudimos verificar su huella'
            : 'Acceso con huella',
        message: message,
        color: state.error != null ? GhTokens.danger : GhTokens.info,
        icon: state.error != null
            ? Icons.fingerprint_rounded
            : Icons.info_outline_rounded,
      ),
    );
  }
}

/// Fila del perfil que refleja y cambia el estado del acceso con huella.
///
/// Si el dispositivo no tiene lector (o no hay huellas registradas) queda
/// deshabilitada y el subtítulo explica el motivo.
class BiometricToggleTile extends ConsumerWidget {
  const BiometricToggleTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final biometric = ref.watch(biometricProvider);
    // Refleja el estado **real** del acceso con huella. No usa la regla del
    // login (`canUseBiometrics`): allí la opción está siempre visible si el
    // dispositivo la soporta, aquí lo que importa es si está activada.
    final enabled = biometric.isEnabled;

    return SwitchListTile(
      key: const Key('profile-biometric-toggle'),
      value: enabled,
      // Sin lector o sin huellas la fila queda deshabilitada con el motivo.
      onChanged: biometric.canOfferActivation
          ? (value) => _toggle(context, ref, value)
          : null,
      secondary: Icon(
        Icons.fingerprint_rounded,
        color: enabled
            ? GhTokens.success
            : Theme.of(context).colorScheme.onSurfaceVariant,
      ),
      title: const Text('Acceso con huella'),
      subtitle: Text(biometricSubtitleFor(biometric)),
    );
  }

  Future<void> _toggle(BuildContext context, WidgetRef ref, bool value) async {
    final ok = await ref.read(biometricProvider.notifier).setEnabled(value);
    if (!context.mounted) return;

    if (value && !ok) {
      final status = ref.read(biometricProvider).status;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text(noticeForMissingBiometrics(status))),
        );
      return;
    }

    final label = ref.read(biometricProvider).deviceLabel;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? (value
                    ? 'Acceso con huella activado en este dispositivo.'
                    : 'Acceso con huella desactivado. Use su contraseña para entrar.')
                : 'No pudimos cambiar el acceso con huella.',
          ),
        ),
      );
    debugPrint('[Biometría] interruptor del perfil: $value ($label)');
  }
}
