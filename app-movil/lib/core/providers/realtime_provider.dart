import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../models/notification.dart';
import '../models/user.dart';
import '../realtime/mock_realtime_service.dart';
import '../realtime/realtime_service.dart';
import '../push/push_service.dart';
import '../utils/json.dart';
import 'auth_provider.dart';
import 'cases_provider.dart';
import 'core_providers.dart';
import 'documents_provider.dart';
import 'messages_provider.dart';
import 'notifications_provider.dart';
import 'cart_provider.dart';

/// Puente entre el hub de tiempo real y el estado de la app.
///
/// **Todo cambio hecho por el admin se refleja sin recargar**: se invalidan los
/// providers afectados por el tipo de evento y se muestra un aviso in-app.
class RealtimeBridge {
  RealtimeBridge(this._ref);

  final Ref _ref;
  StreamSubscription<RealtimeEvent>? _subscription;
  StreamSubscription<RealtimeStatus>? _statusSubscription;
  Timer? _pollTimer;
  DateTime _lastPoll = DateTime.now().toUtc();
  int _bannerSeq = 0;

  void start() {
    final service = _ref.read(realtimeServiceProvider);

    _subscription?.cancel();
    _subscription = service.events.listen(handleEvent);

    _statusSubscription?.cancel();
    _statusSubscription = service.status.listen((status) async {
      if (status == RealtimeStatus.disconnected ||
          status == RealtimeStatus.reconnecting) {
        _startPolling();
      } else if (status == RealtimeStatus.connected) {
        _stopPolling();
      }
    });

    if (service is MockRealtimeService) {
      service.onEvent = handleEvent;
    }
  }

  /// Aplica un evento de tiempo real al estado de la app.
  void handleEvent(RealtimeEvent event) {
    switch (event.type) {
      case RealtimeEventType.notification:
        _ref.invalidate(notificationsProvider);
        _ref.invalidate(unreadNotificationsProvider);
        _showBanner(
          title: event.title ?? 'Novedad en tu expediente',
          body: event.body ?? 'Revisa el detalle en la app.',
          deepLink: event.deepLink,
          type: event.payload['type']?.toString() ?? 'System',
          payload: event.payload,
        );
        break;
      case RealtimeEventType.caseUpdated:
      case RealtimeEventType.caseEvent:
        _ref.invalidate(casesProvider);
        _ref.invalidate(recentCasesProvider);
        _ref.invalidate(dashboardProvider);
        final caseId = event.caseFileId;
        if (caseId != null) {
          _ref.invalidate(caseDetailProvider(caseId));
          _ref.invalidate(caseTimelineProvider(caseId));
        }
        break;
      case RealtimeEventType.taskAssigned:
        _ref.invalidate(tasksProvider);
        _ref.invalidate(dashboardProvider);
        final caseId = event.caseFileId;
        if (caseId != null) _ref.invalidate(caseDetailProvider(caseId));
        break;
      case RealtimeEventType.taskCompleted:
        _ref.invalidate(tasksProvider);
        _ref.invalidate(casesProvider);
        _ref.invalidate(dashboardProvider);
        final caseId = event.caseFileId;
        if (caseId != null) {
          _ref.invalidate(caseDetailProvider(caseId));
          _ref.invalidate(caseTimelineProvider(caseId));
        }
        _showBanner(
          title: event.title ?? 'Tarea completada',
          body: event.body ?? 'La firma completó una tarea de tu expediente.',
          deepLink: event.deepLink,
          payload: event.payload,
        );
        break;
      case RealtimeEventType.documentAdded:
        _ref.invalidate(documentsProvider);
        _ref.invalidate(dashboardProvider);
        final caseId = event.caseFileId;
        if (caseId != null) {
          _ref.invalidate(caseDocumentsProvider(caseId));
          _ref.invalidate(caseDetailProvider(caseId));
        }
        _showBanner(
          title: 'Documento disponible',
          body: event.payload['originalName']?.toString() ??
              'Se agregó un documento a tu expediente.',
          deepLink: event.deepLink ?? '/documents',
          payload: event.payload,
        );
        break;
      case RealtimeEventType.messageCreated:
        final caseId = event.caseFileId;
        _ref.invalidate(messagesProvider(caseId));
        _ref.invalidate(messageThreadsProvider);
        _ref.invalidate(unreadMessagesProvider);
        _showBanner(
          title: event.payload['senderName']?.toString() ?? 'Nuevo mensaje',
          body: event.body ?? 'Tienes un mensaje nuevo de la firma.',
          deepLink: event.deepLink ?? '/messages/$caseId',
          payload: event.payload,
        );
        break;
      case RealtimeEventType.orderUpdated:
      case RealtimeEventType.paymentUpdated:
        _ref.invalidate(ordersProvider);
        _ref.invalidate(dashboardProvider);
        final orderId = event.orderId;
        if (orderId != null) _ref.invalidate(orderDetailProvider(orderId));
        break;
      case RealtimeEventType.accountRequestCreated:
        break;
      case RealtimeEventType.clientUpdated:
        _ref.read(authProvider.notifier).refreshProfile();
        final raw = event.payload['user'];
        if (raw is Map) {
          final user = AppUser.fromJson(asMap(raw));
          _ref.read(authProvider.notifier).markApproved(user);
          _showBanner(
            title: 'Cuenta actualizada',
            body: 'Tu cuenta ya está activa. ¡Bienvenido a GH Contadores!',
            deepLink: '/home',
            payload: event.payload,
          );
        }
        break;
      case RealtimeEventType.connected:
      case RealtimeEventType.disconnected:
      case RealtimeEventType.unknown:
        break;
    }
  }

  void _showBanner({
    required String title,
    required String body,
    String? deepLink,
    String type = 'System',
    Map<String, dynamic> payload = const <String, dynamic>{},
  }) {
    _bannerSeq++;
    _ref.read(inAppBannerProvider.notifier).state = InAppBanner(
      id: _bannerSeq,
      payload: PushPayload(
        title: title,
        body: body,
        type: type,
        deepLink: deepLink,
      ),
    );
    _ref.read(realtimeBannerDeepLinkProvider.notifier).state = deepLink;
    debugPrint('[Realtime][$type] $title — ${deepLink ?? "sin deep link"}');
  }

  /// Polling de respaldo cada 15 s (docs/03 §5).
  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(AppConfig.pollingInterval, (_) => _poll());
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  Future<void> _poll() async {
    try {
      final client = _ref.read(apiClientProvider);
      final since = _lastPoll;
      _lastPoll = DateTime.now().toUtc();
      final fresh = await client.getNotificationsSince(since);
      if (fresh.isEmpty) return;

      for (final n in fresh) {
        _showBanner(
          title: n.title,
          body: n.body,
          deepLink: n.deepLink,
          type: notificationTypeToJson(n.type),
        );
      }
      _ref.invalidate(notificationsProvider);
      _ref.invalidate(unreadNotificationsProvider);
      _ref.invalidate(casesProvider);
      _ref.invalidate(tasksProvider);
      _ref.invalidate(ordersProvider);
    } catch (e) {
      debugPrint('[Realtime][polling] $e');
    }
  }

  void dispose() {
    _subscription?.cancel();
    _statusSubscription?.cancel();
    _pollTimer?.cancel();
  }
}

/// Deep link pendiente del banner in-app.
final realtimeBannerDeepLinkProvider = StateProvider<String?>((ref) => null);

/// Stream de eventos de tiempo real expuesto a la UI.
final realtimeEventsProvider = StreamProvider<RealtimeEvent>((ref) {
  return ref.watch(realtimeServiceProvider).events;
});

/// Puente activo mientras viva la app.
final realtimeBridgeProvider = Provider<RealtimeBridge>((ref) {
  final bridge = RealtimeBridge(ref);
  bridge.start();
  ref.onDispose(bridge.dispose);
  return bridge;
});
