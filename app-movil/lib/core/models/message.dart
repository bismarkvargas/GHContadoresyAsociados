import '../../core/utils/json.dart';
import 'document.dart';

/// Mensaje del hilo cliente ↔ firma (docs/02 §4 `Messages`).
class Message {
  const Message({
    required this.id,
    required this.body,
    required this.isFromClient,
    this.caseFileId,
    this.caseCode,
    this.senderName,
    this.attachment,
    this.readByClientAt,
    this.readByStaffAt,
    this.createdAt,
  });

  final String id;
  final String body;
  final bool isFromClient;
  final String? caseFileId;
  final String? caseCode;
  final String? senderName;
  final DocumentItem? attachment;
  final DateTime? readByClientAt;
  final DateTime? readByStaffAt;
  final DateTime? createdAt;

  /// Un mensaje de la firma está sin leer por el cliente.
  bool get isUnreadByClient => !isFromClient && readByClientAt == null;

  factory Message.fromJson(JsonMap json) => Message(
        id: asStringOr(json['id'], ''),
        body: asStringOr(json['body'], ''),
        isFromClient: asBool(json['isFromClient']),
        caseFileId: asString(json['caseFileId']),
        caseCode: asString(json['caseCode']),
        senderName: asString(json['senderName']),
        attachment: json['attachment'] == null
            ? null
            : DocumentItem.fromJson(asMap(json['attachment'])),
        readByClientAt: asDate(json['readByClientAt']),
        readByStaffAt: asDate(json['readByStaffAt']),
        createdAt: asDate(json['createdAt']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'body': body,
        'isFromClient': isFromClient,
        'caseFileId': caseFileId,
        'caseCode': caseCode,
        'senderName': senderName,
        'attachment': attachment?.toJson(),
        'readByClientAt': readByClientAt?.toIso8601String(),
        'readByStaffAt': readByStaffAt?.toIso8601String(),
        'createdAt': createdAt?.toIso8601String(),
      };

  Message copyWith({DateTime? readByClientAt}) => Message(
        id: id,
        body: body,
        isFromClient: isFromClient,
        caseFileId: caseFileId,
        caseCode: caseCode,
        senderName: senderName,
        attachment: attachment,
        readByClientAt: readByClientAt ?? this.readByClientAt,
        readByStaffAt: readByStaffAt,
        createdAt: createdAt,
      );
}

/// Hilo de conversación agrupado por expediente.
class MessageThread {
  const MessageThread({
    required this.caseFileId,
    required this.caseCode,
    required this.title,
    this.lastMessage,
    this.unreadCount = 0,
    this.responsibleName,
  });

  final String caseFileId;
  final String caseCode;
  final String title;
  final Message? lastMessage;
  final int unreadCount;
  final String? responsibleName;

  JsonMap toJson() => <String, dynamic>{
        'caseFileId': caseFileId,
        'caseCode': caseCode,
        'title': title,
        'lastMessage': lastMessage?.toJson(),
        'unreadCount': unreadCount,
        'responsibleName': responsibleName,
      };
}
