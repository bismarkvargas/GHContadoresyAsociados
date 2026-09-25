import 'package:flutter/material.dart';

import '../../core/utils/json.dart';

/// Tipos de push del contrato (docs/03 §6) y preferencias por tipo (docs/02 §1).
enum NotificationType {
  accountApproved,
  accountRejected,
  caseCreated,
  caseStatusChanged,
  taskAssigned,
  taskDueSoon,
  taskCompleted,
  documentAvailable,
  orderPaid,
  orderStatusChanged,
  paymentFailed,
  messageReceived,
  system,
}

const List<NotificationType> kNotificationTypes = NotificationType.values;

String notificationTypeToJson(NotificationType type) {
  switch (type) {
    case NotificationType.accountApproved:
      return 'AccountApproved';
    case NotificationType.accountRejected:
      return 'AccountRejected';
    case NotificationType.caseCreated:
      return 'CaseCreated';
    case NotificationType.caseStatusChanged:
      return 'CaseStatusChanged';
    case NotificationType.taskAssigned:
      return 'TaskAssigned';
    case NotificationType.taskDueSoon:
      return 'TaskDueSoon';
    case NotificationType.taskCompleted:
      return 'TaskCompleted';
    case NotificationType.documentAvailable:
      return 'DocumentAvailable';
    case NotificationType.orderPaid:
      return 'OrderPaid';
    case NotificationType.orderStatusChanged:
      return 'OrderStatusChanged';
    case NotificationType.paymentFailed:
      return 'PaymentFailed';
    case NotificationType.messageReceived:
      return 'MessageReceived';
    case NotificationType.system:
      return 'System';
  }
}

NotificationType notificationTypeFrom(String? raw) {
  for (final type in NotificationType.values) {
    if (notificationTypeToJson(type) == raw) return type;
  }
  return NotificationType.system;
}

String notificationTypeLabel(NotificationType type) {
  switch (type) {
    case NotificationType.accountApproved:
      return 'Cuenta aprobada';
    case NotificationType.accountRejected:
      return 'Cuenta rechazada';
    case NotificationType.caseCreated:
      return 'Expediente creado';
    case NotificationType.caseStatusChanged:
      return 'Cambio de estado del expediente';
    case NotificationType.taskAssigned:
      return 'Tarea asignada';
    case NotificationType.taskDueSoon:
      return 'Tarea por vencer';
    case NotificationType.taskCompleted:
      return 'Tarea completada';
    case NotificationType.documentAvailable:
      return 'Documento disponible';
    case NotificationType.orderPaid:
      return 'Pedido pagado';
    case NotificationType.orderStatusChanged:
      return 'Cambio de estado del pedido';
    case NotificationType.paymentFailed:
      return 'Pago fallido';
    case NotificationType.messageReceived:
      return 'Mensaje recibido';
    case NotificationType.system:
      return 'Avisos del sistema';
  }
}

IconData notificationTypeIcon(NotificationType type) {
  switch (type) {
    case NotificationType.accountApproved:
      return Icons.verified_user_outlined;
    case NotificationType.accountRejected:
      return Icons.person_off_outlined;
    case NotificationType.caseCreated:
      return Icons.folder_shared_outlined;
    case NotificationType.caseStatusChanged:
      return Icons.published_with_changes_outlined;
    case NotificationType.taskAssigned:
      return Icons.assignment_ind_outlined;
    case NotificationType.taskDueSoon:
      return Icons.alarm_outlined;
    case NotificationType.taskCompleted:
      return Icons.task_alt_outlined;
    case NotificationType.documentAvailable:
      return Icons.description_outlined;
    case NotificationType.orderPaid:
      return Icons.receipt_long_outlined;
    case NotificationType.orderStatusChanged:
      return Icons.local_shipping_outlined;
    case NotificationType.paymentFailed:
      return Icons.credit_card_off_outlined;
    case NotificationType.messageReceived:
      return Icons.forum_outlined;
    case NotificationType.system:
      return Icons.campaign_outlined;
  }
}

/// Notificación in-app (docs/02 §8).
class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    this.status = 'Sent',
    this.channel = 'InApp',
    this.createdAt,
    this.readAt,
    this.deepLink,
    this.caseFileId,
    this.orderId,
    this.entityId,
  });

  final String id;
  final String title;
  final String body;
  final NotificationType type;
  final String status; // Queued | Sent | Failed | Read
  final String channel;
  final DateTime? createdAt;
  final DateTime? readAt;
  final String? deepLink;
  final String? caseFileId;
  final String? orderId;
  final String? entityId;

  bool get isRead => readAt != null || status == 'Read';

  factory AppNotification.fromJson(JsonMap json) {
    final data = asMap(json['data']);
    return AppNotification(
      id: asStringOr(json['id'], ''),
      title: asStringOr(json['title'], 'Notificación'),
      body: asStringOr(json['body'], ''),
      type: notificationTypeFrom(
        asString(json['type'] ?? data['type']),
      ),
      status: asStringOr(json['status'], 'Sent'),
      channel: asStringOr(json['channel'], 'InApp'),
      createdAt: asDate(json['createdAt']),
      readAt: asDate(json['readAt']),
      deepLink: asString(json['deepLink'] ?? data['deepLink']),
      caseFileId: asString(json['caseFileId'] ?? data['caseFileId']),
      orderId: asString(json['orderId'] ?? data['orderId']),
      entityId: asString(json['entityId'] ?? data['entityId']),
    );
  }

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'title': title,
        'body': body,
        'type': notificationTypeToJson(type),
        'status': status,
        'channel': channel,
        'createdAt': createdAt?.toIso8601String(),
        'readAt': readAt?.toIso8601String(),
        'deepLink': deepLink,
        'caseFileId': caseFileId,
        'orderId': orderId,
        'entityId': entityId,
      };

  AppNotification copyWith({DateTime? readAt, String? status}) => AppNotification(
        id: id,
        title: title,
        body: body,
        type: type,
        status: status ?? (readAt != null ? 'Read' : this.status),
        channel: channel,
        createdAt: createdAt,
        readAt: readAt ?? this.readAt,
        deepLink: deepLink,
        caseFileId: caseFileId,
        orderId: orderId,
        entityId: entityId,
      );
}

/// Preferencia por tipo (docs/02 §1 `NotificationPreferences`).
class NotificationPreference {
  const NotificationPreference({
    required this.type,
    this.push = true,
    this.inApp = true,
    this.email = false,
  });

  final NotificationType type;
  final bool push;
  final bool inApp;
  final bool email;

  factory NotificationPreference.fromJson(JsonMap json) => NotificationPreference(
        type: notificationTypeFrom(asString(json['type'])),
        push: asBool(json['push'], fallback: true),
        inApp: asBool(json['inApp'], fallback: true),
        email: asBool(json['email']),
      );

  JsonMap toJson() => <String, dynamic>{
        'type': notificationTypeToJson(type),
        'push': push,
        'inApp': inApp,
        'email': email,
      };

  NotificationPreference copyWith({bool? push, bool? inApp, bool? email}) =>
      NotificationPreference(
        type: type,
        push: push ?? this.push,
        inApp: inApp ?? this.inApp,
        email: email ?? this.email,
      );
}
