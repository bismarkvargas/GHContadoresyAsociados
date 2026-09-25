import 'dart:async';
import 'dart:math';

import '../models/notification.dart';
import 'realtime_service.dart';

/// Simulación de tiempo real para el modo demo: emite eventos periódicos con
/// la misma forma que el hub real, de modo que la UI reacciona sin recargar.
class MockRealtimeService implements RealtimeService {
  MockRealtimeService({this.tick = const Duration(seconds: 12)});

  /// Intervalo entre eventos simulados.
  final Duration tick;

  /// Permite desactivar la emisión periódica (tests).
  ///
  /// Sin esto, el `Timer.periodic` del modo demo quedaría vivo al terminar un
  /// test y rompería la invariante `!timersPending` del binding.
  static bool autoEmitEnabled = true;

  final StreamController<RealtimeEvent> _events =
      StreamController<RealtimeEvent>.broadcast();
  final StreamController<RealtimeStatus> _status =
      StreamController<RealtimeStatus>.broadcast();

  final Random _rng = Random(31);
  Timer? _timer;
  int _step = 0;
  RealtimeStatus _current = RealtimeStatus.idle;

  /// Permite que la capa de datos reciba los efectos de los eventos simulados.
  void Function(RealtimeEvent event)? onEvent;

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

  void _emit(RealtimeEvent event) {
    onEvent?.call(event);
    if (!_events.isClosed) _events.add(event);
  }

  @override
  Future<void> connect({required String userId, String? accessToken}) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    _setStatus(RealtimeStatus.connected);
    _timer?.cancel();
    if (!autoEmitEnabled) return;
    _timer = Timer.periodic(tick, (_) => _emitNext());
  }

  @override
  Future<void> disconnect() async {
    _timer?.cancel();
    _timer = null;
    _setStatus(RealtimeStatus.disconnected);
  }

  @override
  Future<void> dispose() async {
    _timer?.cancel();
    await _events.close();
    await _status.close();
  }

  /// Emite el siguiente evento del guion de demostración.
  void _emitNext() {
    _step++;
    switch (_step % 5) {
      case 1:
        _emit(
          RealtimeEvent(
            type: RealtimeEventType.caseUpdated,
            caseFileId: 'case-0001',
            payload: <String, dynamic>{
              'caseFileId': 'case-0001',
              'status': 'InProgress',
              'progressPercent': min(95, 65 + (_step * 3)),
              'title': 'Avance del expediente GH-EXP-2026-0001',
            },
          ),
        );
        break;
      case 2:
        _emit(
          RealtimeEvent(
            type: RealtimeEventType.notification,
            caseFileId: 'case-0002',
            payload: <String, dynamic>{
              'id': 'not-rt-${DateTime.now().millisecondsSinceEpoch}',
              'title': 'Actualización de tu expediente legal',
              'body':
                  'La Lic. Karla Vega registró una nueva actuación en GH-EXP-2026-0002.',
              'type': notificationTypeToJson(NotificationType.caseStatusChanged),
              'deepLink': '/cases/case-0002',
              'caseFileId': 'case-0002',
            },
          ),
        );
        break;
      case 3:
        _emit(
          RealtimeEvent(
            type: RealtimeEventType.documentAdded,
            caseFileId: 'case-0001',
            payload: <String, dynamic>{
              'caseFileId': 'case-0001',
              'originalName': 'Acuse de recibido ATV.pdf',
              'category': 'Tributario',
              'deepLink': '/documents?caseFileId=case-0001',
            },
          ),
        );
        break;
      case 4:
        _emit(
          RealtimeEvent(
            type: RealtimeEventType.messageCreated,
            caseFileId: 'case-0002',
            payload: <String, dynamic>{
              'caseFileId': 'case-0002',
              'caseCode': 'GH-EXP-2026-0002',
              'body':
                  'Le recuerdo que la firma de la escritura está agendada para esta semana.',
              'senderName': 'Lic. Karla Vega',
              'deepLink': '/messages/case-0002',
            },
          ),
        );
        break;
      default:
        _emit(
          RealtimeEvent(
            type: RealtimeEventType.taskCompleted,
            caseFileId: 'case-0001',
            payload: <String, dynamic>{
              'caseFileId': 'case-0001',
              'title': 'Tarea completada por la firma',
              'body': '«Generar formulario D-101 en plataforma ATV» quedó completada.',
              'deepLink': '/cases/case-0001',
            },
          ),
        );
        break;
    }
  }

  /// Fuerza un evento concreto (usado por tests y por acciones del usuario).
  void emitNow(RealtimeEvent event) => _emit(event);

  /// Inyecta un evento aleatorio de los usados en la demo.
  void emitRandom() => _emitNext();

  int get seed => _rng.nextInt(100);
}
