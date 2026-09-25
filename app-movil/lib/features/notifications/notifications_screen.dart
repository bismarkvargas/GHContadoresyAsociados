import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/notification.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/providers/guest_provider.dart';
import '../../core/providers/notifications_provider.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_guest.dart';
import '../../core/widgets/gh_logo.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';
import '../../core/widgets/push_permission_ui.dart';

/// Bandeja de notificaciones in-app con filtros, marcado de leído y
/// navegación por deep link al expediente o pedido correspondiente.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  static const List<({String value, String label})> _types =
      <({String value, String label})>[
    (value: 'all', label: 'Todas'),
    (value: 'CaseCreated', label: 'Expedientes'),
    (value: 'CaseStatusChanged', label: 'Estados'),
    (value: 'TaskDueSoon', label: 'Tareas'),
    (value: 'DocumentAvailable', label: 'Documentos'),
    (value: 'OrderPaid', label: 'Pagos'),
    (value: 'MessageReceived', label: 'Mensajes'),
  ];

  Future<void> _open(AppNotification notification) async {
    await ref.read(notificationActionsProvider).markRead(notification.id);
    if (!mounted) return;

    final link = notification.deepLink;
    if (link != null && link.isNotEmpty) {
      final route = AppRoutes.normalizeDeepLink(link)!;
      try {
        context.push(route);
        return;
      } catch (_) {
        // Deep link no navegable: se ignora.
      }
    }
    if (notification.caseFileId != null) {
      context.push(AppRoutes.caseDetail(notification.caseFileId!));
    } else if (notification.orderId != null) {
      context.push(AppRoutes.orderDetail(notification.orderId!));
    }
  }

  @override
  Widget build(BuildContext context) {
    final filters = ref.watch(notificationFiltersProvider);
    final notifications = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final theme = Theme.of(context);
    final isLoggedIn = ref.watch(authProvider).isAuthenticated;

    if (!isLoggedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('Notificaciones')),
        body: Column(
          children: <Widget>[
            const GhTopStripe(),
            const Expanded(
              child: GhGuestState(intent: GuestIntent.notifications),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notificaciones'),
        actions: <Widget>[
          if (unread > 0)
            TextButton(
              onPressed: () async {
                await ref.read(notificationActionsProvider).markAllRead();
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Marcaste todo como leído.')),
                );
              },
              child: const Text('Marcar todo'),
            ),
        ],
      ),
      body: Column(
        children: <Widget>[
          // Si el permiso está denegado, se avisa arriba del listado con un
          // botón para activarlas (o abrir los ajustes si están bloqueadas).
          const PushDisabledNotice(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: <Widget>[
                Icon(
                  unread > 0
                      ? Icons.notifications_active_rounded
                      : Icons.notifications_none_rounded,
                  size: 18,
                  color: unread > 0 ? GhTokens.primary : GhTokens.muted,
                ),
                const SizedBox(width: 8),
                Text(
                  unread > 0
                      ? '$unread sin leer'
                      : 'Estás al día con tus avisos',
                  style: theme.textTheme.labelLarge,
                ),
                const Spacer(),
                if (ref.watch(useMocksProvider))
                  const GhDemoChip(label: 'Avisos en vivo'),
              ],
            ),
          ),
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: <Widget>[
                for (final type in _types)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(type.label),
                      selected: (filters.type ?? 'all') == type.value,
                      onSelected: (_) {
                        final current = ref.read(notificationFiltersProvider);
                        ref.read(notificationFiltersProvider.notifier).state =
                            type.value == 'all'
                                ? current.copyWith(clearType: true)
                                : current.copyWith(type: type.value);
                      },
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SwitchListTile(
              value: filters.unreadOnly,
              onChanged: (value) {
                final current = ref.read(notificationFiltersProvider);
                ref.read(notificationFiltersProvider.notifier).state =
                    current.copyWith(unreadOnly: value);
              },
              contentPadding: EdgeInsets.zero,
              dense: true,
              title: const Text('Solo sin leer'),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(notificationsProvider);
                await ref.read(notificationsProvider.future);
              },
              child: notifications.when(
                loading: () => const ListSkeleton(count: 4, lines: 2),
                error: (error, _) => GhErrorState(
                  message: 'No pudimos cargar tus notificaciones.',
                  onRetry: () => ref.invalidate(notificationsProvider),
                ),
                data: (list) {
                  if (list.isEmpty) {
                    return GhEmptyState(
                      icon: Icons.notifications_none_rounded,
                      title: 'Sin notificaciones',
                      message: filters.unreadOnly
                          ? 'No tienes avisos sin leer. ¡Buen trabajo!'
                          : 'Cuando la firma avance en tus trámites verás los avisos aquí.',
                    );
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: list.length,
                    itemBuilder: (context, index) {
                      final notification = list[index];
                      return _NotificationCard(
                        notification: notification,
                        onTap: () => _open(notification),
                        onMarkRead: () => ref
                            .read(notificationActionsProvider)
                            .markRead(notification.id),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.notification,
    required this.onTap,
    required this.onMarkRead,
  });

  final AppNotification notification;
  final VoidCallback onTap;
  final VoidCallback onMarkRead;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unread = !notification.isRead;

    return GhCard(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: onTap,
      borderColor: unread ? GhTokens.primary.withValues(alpha: 0.4) : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: GhTokens.primary50,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              notificationTypeIcon(notification.type),
              size: 18,
              color: GhTokens.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        notification.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontSize: 14,
                          fontWeight: unread ? FontWeight.w700 : FontWeight.w600,
                        ),
                      ),
                    ),
                    if (unread)
                      Container(
                        width: 8,
                        height: 8,
                        margin: const EdgeInsets.only(left: 6, top: 4),
                        decoration: const BoxDecoration(
                          color: GhTokens.primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  notification.body,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall,
                ),
                const SizedBox(height: 8),
                Row(
                  children: <Widget>[
                    GhStatusBadge(
                      status: 'Active',
                      label: notificationTypeLabel(notification.type),
                      compact: true,
                    ),
                    const Spacer(),
                    Text(
                      GhFormat.relative(notification.createdAt),
                      style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                    ),
                  ],
                ),
                if (unread) ...<Widget>[
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: onMarkRead,
                      style: TextButton.styleFrom(
                        minimumSize: const Size(0, 32),
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                      child: const Text('Marcar como leído'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
