import 'dart:async';
import 'dart:convert';

import 'package:signalr_netcore/signalr_client.dart';

import '../config/app_config.dart';

/// Eventos del hub `/hubs/realtime` (docs/03 §5).
enum RealtimeEventType {
  notification,
  caseUpdated,
  caseEvent,
  taskAssigned,
  taskCompleted,
  documentAdded,
  orderUpdated,
  paymentUpdated,
  messageCreated,
  accountRequestCreated,
  clientUpdated,
  connected,
  disconnected,
  unknown,
}

RealtimeEventType realtimeEventTypeFrom(String method) {
  switch (method) {
    case 'notification':
      return RealtimeEventType.notification;
    case 'case.updated':
      return RealtimeEventType.caseUpdated;
    case 'case.event':
      return RealtimeEventType.caseEvent;
    case 'task.assigned':
      return RealtimeEventType.taskAssigned;
    case 'task.completed':
      return RealtimeEventType.taskCompleted;
    case 'document.added':
      return RealtimeEventType.documentAdded;
    case 'order.updated':
      return RealtimeEventType.orderUpdated;
    case 'payment.updated':
      return RealtimeEventType.paymentUpdated;
    case 'message.created':
      return RealtimeEventType.messageCreated;
    case 'accountrequest.created':
      return RealtimeEventType.accountRequestCreated;
    case 'client.updated':
      return RealtimeEventType.clientUpdated;
    default:
      return RealtimeEventType.unknown;
  }
}

/// Un evento de tiempo real ya normalizado, listo para la UI.
class RealtimeEvent {
  const RealtimeEvent({
    required this.type,
    required this.payload,
    this.caseFileId,
    this.orderId,
    this.entityId,
  });

  final RealtimeEventType type;
  final Map<String, dynamic> payload;
  final String? caseFileId;
  final String? orderId;
  final String? entityId;

  String? get deepLink => payload['deepLink']?.toString();

  String? get title => payload['title']?.toString();

  String? get body => payload['body']?.toString();

  factory RealtimeEvent.fromMethod(String method, List<Object?>? args) {
    Map<String, dynamic> payload = <String, dynamic>{};
    if (args != null && args.isNotEmpty) {
      final first = args.first;
      if (first is Map) {
        payload = first.map((k, v) => MapEntry(k.toString(), v));
      } else if (first is String && first.trim().startsWith('{')) {
        try {
          final decoded = jsonDecode(first);
          if (decoded is Map) {
            payload = decoded.map((k, v) => MapEntry(k.toString(), v));
          }
        } catch (_) {}
      }
    }
    return RealtimeEvent(
      type: realtimeEventTypeFrom(method),
      payload: payload,
      caseFileId: payload['caseFileId']?.toString(),
      orderId: payload['orderId']?.toString(),
      entityId: payload['entityId']?.toString(),
    );
  }
}

/// Estado de la conexión de tiempo real.
enum RealtimeStatus { idle, connecting, connected, reconnecting, disconnected, polling }

/// Contrato del cliente de tiempo real.
abstract class RealtimeService {
  Stream<RealtimeEvent> get events;
  Stream<RealtimeStatus> get status;
  RealtimeStatus get currentStatus;
  bool get isConnected;

  Future<void> connect({required String userId, String? accessToken});
  Future<void> disconnect();
  Future<void> dispose();
}

/// Cliente SignalR contra `/hubs/realtime` con reconexión exponencial.
class SignalRRealtimeService implements RealtimeService {
  SignalRRealtimeService({String? baseUrl, String? accessToken})
      : _baseUrl = baseUrl ?? AppConfig.apiBaseUrl,
        _accessToken = accessToken;

  final String _baseUrl;
  String? _accessToken;

  final StreamController<RealtimeEvent> _events =
      StreamController<RealtimeEvent>.broadcast();
  final StreamController<RealtimeStatus> _status =
      StreamController<RealtimeStatus>.broadcast();

  HubConnection? _connection;
  String? _userId;
  RealtimeStatus _current = RealtimeStatus.idle;
  Timer? _reconnectTimer;
  int _attempt = 0;
  bool _disposed = false;

  static const List<String> _serverMethods = <String>[
    'notification',
    'case.updated',
    'case.event',
    'task.assigned',
    'task.completed',
    'document.added',
    'order.updated',
    'payment.updated',
    'message.created',
    'accountrequest.created',
    'client.updated',
  ];

  @override
  Stream<RealtimeEvent> get events => _events.stream;

  @override
  Stream<RealtimeStatus> get status => _status.stream;

  @override
  RealtimeStatus get currentStatus => _current;

  @override
  bool get isConnected => _current == RealtimeStatus.connected;

  void _setStatus(RealtimeStatus value) {
    _current = value;
    if (!_status.isClosed) _status.add(value);
  }

  String _hubUrl() {
    // Se conserva la raíz de despliegue de la API (por ejemplo /ghcontadores) y solo se
    // sustituye la ruta de versión por la del hub.
    final uri = Uri.parse(_baseUrl);
    final raiz = uri.path.replaceFirst(RegExp(r'/api/v\d+/?$'), '');
    final base = uri.replace(path: '$raiz${AppConfig.realtimeHubPath}').toString();
    final token = _accessToken;
    if (token == null || token.isEmpty) return base;
    return '$base?access_token=${Uri.encodeComponent(token)}';
  }

  @override
  Future<void> connect({required String userId, String? accessToken}) async {
    if (_disposed) return;
    if (accessToken != null && accessToken.isNotEmpty) _accessToken = accessToken;
    _userId = userId;
    _attempt = 0;

    try {
      await _connection?.stop();
    } catch (_) {}

    _setStatus(RealtimeStatus.connecting);
    try {
      final connection = HubConnectionBuilder()
          .withUrl(_hubUrl())
          .withAutomaticReconnect(retryDelays: <int>[0, 2000, 5000, 10000, 20000, 30000])
          .build();

      for (final method in _serverMethods) {
        connection.on(method, (arguments) {
          if (_events.isClosed) return;
          _events.add(RealtimeEvent.fromMethod(method, arguments));
        });
      }

      connection.onclose(({error}) {
        _setStatus(RealtimeStatus.disconnected);
        _scheduleReconnect();
      });

      connection.onreconnecting(({error}) {
        _setStatus(RealtimeStatus.reconnecting);
      });

      connection.onreconnected(({connectionId}) {
        _attempt = 0;
        _setStatus(RealtimeStatus.connected);
        _resubscribe();
      });

      _connection = connection;
      await connection.start();
      _setStatus(RealtimeStatus.connected);
      await _resubscribe();
    } catch (e) {
      _setStatus(RealtimeStatus.disconnected);
      _scheduleReconnect();
    }
  }

  Future<void> _resubscribe() async {
    final userId = _userId;
    if (userId == null) return;
    try {
      await _connection?.invoke('Subscribe', args: <Object>['user:$userId']);
    } catch (_) {
      // El servidor puede haber metido al usuario en el grupo al autenticar.
    }
  }

  void _scheduleReconnect() {
    if (_disposed) return;
    _reconnectTimer?.cancel();
    _attempt++;
    // Backoff exponencial acotado: 2s, 4s, 8s, 16s, 30s…
    final seconds = (2 * (1 << (_attempt.clamp(0, 4)))).clamp(2, 30);
    _reconnectTimer = Timer(Duration(seconds: seconds), () {
      final userId = _userId;
      if (userId != null) {
        connect(userId: userId, accessToken: _accessToken);
      }
    });
  }

  @override
  Future<void> disconnect() async {
    _reconnectTimer?.cancel();
    try {
      await _connection?.stop();
    } catch (_) {}
    _connection = null;
    _setStatus(RealtimeStatus.disconnected);
  }

  @override
  Future<void> dispose() async {
    _disposed = true;
    _reconnectTimer?.cancel();
    await disconnect();
    await _events.close();
    await _status.close();
  }
}
