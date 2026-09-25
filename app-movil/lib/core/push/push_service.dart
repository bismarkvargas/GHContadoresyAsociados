import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Payload estándar de push/deep link (docs/03 §6).
class PushPayload {
  const PushPayload({
    required this.title,
    required this.body,
    this.type = 'System',
    this.deepLink,
    this.entityId,
    this.caseFileId,
    this.orderId,
  });

  final String title;
  final String body;
  final String type;
  final String? deepLink;
  final String? entityId;
  final String? caseFileId;
  final String? orderId;

  factory PushPayload.fromData(Map<String, dynamic> data, {String? fallbackTitle}) =>
      PushPayload(
        title: (data['title'] ?? fallbackTitle ?? 'GH Contadores').toString(),
        body: (data['body'] ?? '').toString(),
        type: (data['type'] ?? 'System').toString(),
        deepLink: data['deepLink']?.toString(),
        entityId: data['entityId']?.toString(),
        caseFileId: data['caseFileId']?.toString(),
        orderId: data['orderId']?.toString(),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'title': title,
        'body': body,
        'type': type,
        'deepLink': deepLink,
        'entityId': entityId,
        'caseFileId': caseFileId,
        'orderId': orderId,
      };
}

/// Centro de notificaciones local (Android + iOS).
///
/// Toda la capa de Firebase es **tolerante a su ausencia**: mientras el proyecto
/// no esté configurado (sin `android/app/google-services.json` ni
/// `ios/Runner/GoogleService-Info.plist`) la app arranca igual, el modo demo se
/// mantiene y el registro del token FCM simplemente se omite.
/// Ver `README.md` §Firebase para activarlo.
class LocalNotificationService {
  LocalNotificationService();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;

  /// Se vuelve `true` cuando un `FirebasePushAdapter` está conectado.
  bool _firebaseReady = false;

  bool get firebaseReady => _firebaseReady;

  /// Callback cuando el usuario toca una notificación (deep link).
  void Function(PushPayload payload)? onNotificationTap;

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'gh_contadores_default',
    'Avisos de GH Contadores',
    description:
        'Estado de expedientes, tareas, documentos, pagos y mensajes de la firma.',
    importance: Importance.high,
  );

  static String get channelId => _channel.id;

  /// Marca el adaptador FCM como disponible (lo llama el bootstrap).
  void markFirebaseReady(bool ready) => _firebaseReady = ready;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // Tope de tiempo cancelable: si la plataforma no responde (emulador, tests
    // o un dispositivo sin el plugin listo) la app no queda esperando y no se
    // dejan temporizadores vivos.
    try {
      await AsyncGuard.withTimeout(
        _plugin.initialize(
          const InitializationSettings(
            android: AndroidInitializationSettings('@mipmap/ic_launcher'),
            iOS: DarwinInitializationSettings(
              requestAlertPermission: false,
              requestBadgePermission: false,
              requestSoundPermission: false,
            ),
          ),
          onDidReceiveNotificationResponse: _handleResponse,
          onDidReceiveBackgroundNotificationResponse: _handleBackgroundResponse,
        ),
        limit: const Duration(seconds: 3),
        label: 'push.initialize',
      );
    } catch (e) {
      debugPrint('[Push] notificaciones locales no disponibles: $e');
    }

    try {
      await AsyncGuard.withTimeout(
        _plugin
                .resolvePlatformSpecificImplementation<
                    AndroidFlutterLocalNotificationsPlugin>()
                ?.createNotificationChannel(_channel) ??
            Future<void>.value(),
        limit: const Duration(seconds: 3),
        label: 'push.channel',
      );
    } catch (e) {
      debugPrint('[Push] no se pudo crear el canal Android: $e');
    }
  }

  /// Notificación nativa (bandeja del sistema).
  Future<void> show(PushPayload payload) async {
    await init();
    try {
      await _plugin.show(
        DateTime.now().millisecondsSinceEpoch ~/ 1000 % 100000,
        payload.title,
        payload.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _channel.id,
            _channel.name,
            channelDescription: _channel.description,
            importance: Importance.high,
            priority: Priority.high,
            icon: '@mipmap/ic_launcher',
            styleInformation: BigTextStyleInformation(payload.body),
          ),
          iOS: const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
          ),
        ),
        payload: jsonEncode(payload.toJson()),
      );
    } catch (e) {
      debugPrint('[Push] no se pudo mostrar la notificación: $e');
    }
  }

  Future<void> cancelAll() async {
    try {
      await _plugin.cancelAll();
    } catch (_) {}
  }

  void _handleResponse(NotificationResponse response) {
    final raw = response.payload;
    if (raw == null || raw.isEmpty) return;
    try {
      final decoded = raw.startsWith('{')
          ? Map<String, dynamic>.from(jsonDecode(raw) as Map)
          : <String, dynamic>{'deepLink': raw};
      onNotificationTap?.call(PushPayload.fromData(decoded));
    } catch (e) {
      debugPrint('[Push] payload inválido: $e');
    }
  }

  @pragma('vm:entry-point')
  static void _handleBackgroundResponse(NotificationResponse response) {
    // El sistema operativo despierta un isolate aparte: solo registramos.
    debugPrint('[Push][background] tap: ${response.payload}');
  }
}
