import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/notification.dart';
import 'core_providers.dart';

/// Filtro de la bandeja de notificaciones.
class NotificationFilters {
  const NotificationFilters({this.type, this.unreadOnly = false});

  /// `null` o `'all'` = todas.
  final String? type;
  final bool unreadOnly;

  NotificationFilters copyWith({
    String? type,
    bool? unreadOnly,
    bool clearType = false,
  }) =>
      NotificationFilters(
        type: clearType ? null : (type ?? this.type),
        unreadOnly: unreadOnly ?? this.unreadOnly,
      );
}

final notificationFiltersProvider =
    StateProvider<NotificationFilters>((ref) => const NotificationFilters());

/// Bandeja in-app (`GET /me/notifications`).
final notificationsProvider =
    FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  final filters = ref.watch(notificationFiltersProvider);
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getNotifications(
    type: (filters.type == null || filters.type == 'all') ? null : filters.type,
    unreadOnly: filters.unreadOnly ? true : null,
    pageSize: 60,
  );
  return result.items;
});

/// Cantidad de notificaciones sin leer (badge de la barra inferior).
final unreadNotificationsProvider = FutureProvider.autoDispose<int>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getNotifications(unreadOnly: true, pageSize: 100);
  return result.total;
});

/// Acciones sobre la bandeja.
final notificationActionsProvider = Provider<NotificationActions>((ref) {
  return NotificationActions(ref);
});

class NotificationActions {
  const NotificationActions(this._ref);

  final Ref _ref;

  Future<void> markRead(String id) async {
    final client = await _ref.read(apiBootstrapProvider.future);
    await client.markNotificationRead(id);
    _ref.invalidate(notificationsProvider);
    _ref.invalidate(unreadNotificationsProvider);
  }

  Future<void> markAllRead() async {
    final client = await _ref.read(apiBootstrapProvider.future);
    await client.markAllNotificationsRead();
    _ref.invalidate(notificationsProvider);
    _ref.invalidate(unreadNotificationsProvider);
  }
}

/// Preferencias de notificación por tipo (docs/02 §1).
final notificationPreferencesProvider =
    FutureProvider.autoDispose<List<NotificationPreference>>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final list = await client.getNotificationPreferences();
  if (list.isNotEmpty) return list;
  return NotificationType.values
      .map((t) => NotificationPreference(type: t))
      .toList();
});

/// Guarda un cambio puntual de preferencia (switch de la pantalla de perfil).
Future<void> savePreference(
  Ref ref,
  NotificationPreference preference,
) async {
  final client = await ref.read(apiBootstrapProvider.future);
  final current = await ref.read(notificationPreferencesProvider.future);
  final updated = <NotificationPreference>[
    for (final p in current) if (p.type == preference.type) preference else p,
  ];
  if (!updated.any((p) => p.type == preference.type)) {
    updated.add(preference);
  }
  await client.updateNotificationPreferences(updated);
  ref.invalidate(notificationPreferencesProvider);
}
