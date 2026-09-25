import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/push_permission_provider.dart';
import '../push/push_permission_service.dart';
import '../theme/gh_tokens.dart';
import 'gh_logo.dart';

/// Diálogo con la identidad de la firma que explica el beneficio de las
/// notificaciones **antes** del permiso del sistema.
///
/// Se muestra una sola vez (no en arranques en frío ni sin sesión). El permiso
/// del sistema solo se puede pedir una vez, así que el aviso previo es lo que
/// evita gastarlo sin contexto.
///
/// Devuelve `true` si el usuario activó las notificaciones.
Future<bool> showPushPermissionDialog(BuildContext context, WidgetRef ref) async {
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) {
      final theme = Theme.of(dialogContext);
      return AlertDialog(
        key: const Key('push-permission-dialog'),
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
                      Icons.notifications_active_outlined,
                      size: 32,
                      color: GhTokens.primary,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const GhLogoImage(height: 30),
                  const SizedBox(height: 14),
                  Text(
                    'Active las notificaciones',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Reciba avisos cuando su expediente avance, cuando le '
                    'asignemos una tarea y cuando tenga un documento nuevo.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const _PushBenefit(
                    icon: Icons.folder_open_rounded,
                    text: 'Avance de sus expedientes y trámites',
                  ),
                  const _PushBenefit(
                    icon: Icons.checklist_rounded,
                    text: 'Tareas que dependen de usted',
                  ),
                  const _PushBenefit(
                    icon: Icons.description_outlined,
                    text: 'Documentos, pagos y mensajes de la firma',
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
                      key: const Key('push-dialog-activate'),
                      onPressed: () => Navigator.of(dialogContext).pop(true),
                      icon: const Icon(Icons.notifications_active_rounded, size: 18),
                      label: const Text('Activar notificaciones'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      key: const Key('push-dialog-later'),
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

  if (result != true) {
    // El usuario dijo «Ahora no» (o cerró el aviso): queda registrado para no
    // volver a proponérselo ni en esta sesión ni en los próximos arranques.
    await markPushAskedFromWidget(ref);
    return false;
  }
  if (!context.mounted) return false;

  return activatePushNotifications(context, ref);
}

/// Pide el permiso del sistema, registra el token y avisa del resultado.
///
/// Lo usan el diálogo, la tarjeta de aviso y el interruptor del perfil.
Future<bool> activatePushNotifications(
  BuildContext context,
  WidgetRef ref,
) async {
  final status = await ref.read(pushPermissionProvider.notifier).request();
  await markPushAskedFromWidget(ref);

  if (!context.mounted) return status.isGranted;

  switch (status) {
    case PushPermissionStatus.granted:
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Notificaciones activadas. Le avisaremos de cada avance.'),
          ),
        );
      return true;
    case PushPermissionStatus.permanentlyDenied:
    case PushPermissionStatus.denied:
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: const Text(
              'Las notificaciones quedaron desactivadas. Puede activarlas '
              'cuando quiera desde Mi cuenta.',
            ),
            action: SnackBarAction(
              label: 'Ajustes',
              textColor: Colors.white,
              onPressed: () =>
                  ref.read(pushPermissionProvider.notifier).openSettings(),
            ),
          ),
        );
      return false;
    case PushPermissionStatus.unavailable:
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text(
              'Este dispositivo no admite notificaciones push por ahora. '
              'Verá los avisos dentro de la app.',
            ),
          ),
        );
      return false;
    case PushPermissionStatus.notDetermined:
      return false;
  }
}

class _PushBenefit extends StatelessWidget {
  const _PushBenefit({required this.icon, required this.text});

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

/// Tarjeta de aviso cuando las notificaciones están desactivadas.
///
/// Se usa en la bandeja de Notificaciones y en el perfil.
class PushDisabledNotice extends ConsumerWidget {
  const PushDisabledNotice({
    super.key,
    this.compact = false,
    this.margin = const EdgeInsets.fromLTRB(16, 12, 16, 4),
  });

  final bool compact;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(pushPermissionProvider).valueOrNull;
    if (status == null || status.isGranted) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final blocked = status.needsSettings;
    final unavailable = status == PushPermissionStatus.unavailable;

    return Padding(
      padding: margin,
      child: Container(
        key: const Key('push-disabled-notice'),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLowest,
          borderRadius: GhTokens.cardRadius,
          border: Border.all(color: GhTokens.warning.withValues(alpha: 0.45)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: <Widget>[
            const GhTopStripe(includeSafeArea: false, height: 4),
            Padding(
              padding: EdgeInsets.all(compact ? 12 : 16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: GhTokens.warning.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.notifications_off_outlined,
                      size: 20,
                      color: GhTokens.warning,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          'Las notificaciones están desactivadas',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontSize: compact ? 14 : 15,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          unavailable
                              ? 'Este dispositivo no admite push en este '
                                  'momento; verá los avisos dentro de la app.'
                              : blocked
                                  ? 'El sistema las bloqueó. Ábralas en los '
                                      'ajustes de la aplicación.'
                                  : 'Actívelas para enterarse del avance de sus '
                                      'trámites en el momento.',
                          style: theme.textTheme.bodySmall,
                        ),
                        const SizedBox(height: 10),
                        if (!unavailable)
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              key: const Key('push-notice-activate'),
                              onPressed: () async {
                                if (blocked) {
                                  await ref
                                      .read(pushPermissionProvider.notifier)
                                      .openSettings();
                                  return;
                                }
                                await activatePushNotifications(context, ref);
                              },
                              icon: Icon(
                                blocked
                                    ? Icons.settings_outlined
                                    : Icons.notifications_active_outlined,
                                size: 17,
                              ),
                              label: Text(
                                blocked ? 'Abrir ajustes' : 'Activar notificaciones',
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
