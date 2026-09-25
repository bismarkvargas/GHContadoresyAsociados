import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/notification.dart';
import '../../core/providers/notifications_provider.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';

/// Preferencias de notificación: un switch por cada tipo de push
/// (docs/03 §6) con sus canales push, in-app y correo.
class NotificationPreferencesScreen extends ConsumerWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preferences = ref.watch(notificationPreferencesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Notificaciones')),
      body: preferences.when(
        loading: () => const ListSkeleton(count: 5, lines: 1),
        error: (error, _) => GhErrorState(
          message: 'No pudimos cargar tus preferencias.',
          onRetry: () => ref.invalidate(notificationPreferencesProvider),
        ),
        data: (list) {
          final ordered = <NotificationPreference>[
            for (final type in NotificationType.values)
              list.firstWhere(
                (p) => p.type == type,
                orElse: () => NotificationPreference(type: type),
              ),
          ];

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: <Widget>[
              Text(
                'Elige qué avisos quieres recibir',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 6),
              Text(
                'Los avisos críticos de tus expedientes y pagos siempre llegan a la '
                'bandeja dentro de la app.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              GhCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: <Widget>[
                    for (int i = 0; i < ordered.length; i++) ...<Widget>[
                      SwitchListTile(
                        value: ordered[i].push,
                        onChanged: (value) async {
                          await savePreference(
                            ref,
                            ordered[i].copyWith(push: value),
                          );
                        },
                        secondary: Icon(
                          notificationTypeIcon(ordered[i].type),
                          color: GhTokens.primary,
                        ),
                        title: Text(notificationTypeLabel(ordered[i].type)),
                        subtitle: Text(
                          ordered[i].inApp
                              ? 'Push activo · también en la bandeja'
                              : 'Solo en la bandeja de la app',
                        ),
                      ),
                      if (i != ordered.length - 1) const Divider(height: 1),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 20),
              GhInlineNotice(
                message:
                    'En producción el token FCM se registra con POST /me/devices y '
                    'estas preferencias se guardan con PUT /me/notification-preferences.',
                color: GhTokens.info,
                icon: Icons.info_outline_rounded,
              ),
            ],
          );
        },
      ),
    );
  }
}
