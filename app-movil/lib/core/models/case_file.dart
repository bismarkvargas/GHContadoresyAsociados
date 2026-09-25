import '../../core/utils/json.dart';
import 'document.dart';
import 'user.dart' show clientTypeFrom, clientTypeToJson, ClientType;

/// Expediente (docs/02 §4).
class CaseFile {
  const CaseFile({
    required this.id,
    required this.code,
    required this.title,
    required this.matter,
    required this.entity,
    required this.status,
    this.description,
    this.referenceNumber,
    this.priority = 'Normal',
    this.responsibleName,
    this.openedAt,
    this.dueAt,
    this.closedAt,
    this.agreedAmount,
    this.currency = 'USD',
    this.progressPercent = 0,
    this.clientVisible = true,
    this.orderNumber,
    this.clientType = ClientType.individual,
    this.tasksTotal = 0,
    this.tasksDone = 0,
    this.documentsCount = 0,
    this.unreadMessages = 0,
  });

  final String id;
  final String code;
  final String title;
  final String matter;
  final String entity;
  final String status;
  final String? description;
  final String? referenceNumber;
  final String priority;
  final String? responsibleName;
  final DateTime? openedAt;
  final DateTime? dueAt;
  final DateTime? closedAt;
  final double? agreedAmount;
  final String currency;
  final int progressPercent;
  final bool clientVisible;
  final String? orderNumber;
  final ClientType clientType;
  final int tasksTotal;
  final int tasksDone;
  final int documentsCount;
  final int unreadMessages;

  bool get isOpen => status != 'Closed' && status != 'Cancelled' && status != 'Completed';
  bool get isOverdue {
    if (dueAt == null || !isOpen) return false;
    return dueAt!.isBefore(DateTime.now().toUtc());
  }

  double get progress => (progressPercent.clamp(0, 100)) / 100;

  factory CaseFile.fromJson(JsonMap json) => CaseFile(
        id: asStringOr(json['id'], ''),
        code: asStringOr(json['code'], ''),
        title: asStringOr(json['title'], 'Expediente'),
        matter: asStringOr(json['matter'], 'Otro'),
        entity: asStringOr(json['entity'], 'Otro'),
        status: asStringOr(json['status'], 'Open'),
        description: asString(json['description']),
        referenceNumber: asString(json['referenceNumber']),
        priority: asStringOr(json['priority'], 'Normal'),
        responsibleName: asString(json['responsibleName']),
        openedAt: asDate(json['openedAt']),
        dueAt: asDate(json['dueAt']),
        closedAt: asDate(json['closedAt']),
        agreedAmount: asDouble(json['agreedAmount']),
        currency: asStringOr(json['currency'], 'USD'),
        progressPercent: asIntOr(json['progressPercent'], 0),
        clientVisible: asBool(json['clientVisible'], fallback: true),
        orderNumber: asString(json['orderNumber']),
        clientType: clientTypeFrom(asString(json['clientType'])),
        tasksTotal: asIntOr(json['tasksTotal'], 0),
        tasksDone: asIntOr(json['tasksDone'], 0),
        documentsCount: asIntOr(json['documentsCount'], 0),
        unreadMessages: asIntOr(json['unreadMessages'], 0),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'code': code,
        'title': title,
        'matter': matter,
        'entity': entity,
        'status': status,
        'description': description,
        'referenceNumber': referenceNumber,
        'priority': priority,
        'responsibleName': responsibleName,
        'openedAt': openedAt?.toIso8601String(),
        'dueAt': dueAt?.toIso8601String(),
        'closedAt': closedAt?.toIso8601String(),
        'agreedAmount': agreedAmount,
        'currency': currency,
        'progressPercent': progressPercent,
        'clientVisible': clientVisible,
        'orderNumber': orderNumber,
        'clientType': clientTypeToJson(clientType),
        'tasksTotal': tasksTotal,
        'tasksDone': tasksDone,
        'documentsCount': documentsCount,
        'unreadMessages': unreadMessages,
      };

  CaseFile copyWith({
    String? status,
    int? progressPercent,
    String? referenceNumber,
    DateTime? dueAt,
    int? tasksTotal,
    int? tasksDone,
    int? documentsCount,
    int? unreadMessages,
  }) =>
      CaseFile(
        id: id,
        code: code,
        title: title,
        matter: matter,
        entity: entity,
        status: status ?? this.status,
        description: description,
        referenceNumber: referenceNumber ?? this.referenceNumber,
        priority: priority,
        responsibleName: responsibleName,
        openedAt: openedAt,
        dueAt: dueAt ?? this.dueAt,
        closedAt: closedAt,
        agreedAmount: agreedAmount,
        currency: currency,
        progressPercent: progressPercent ?? this.progressPercent,
        clientVisible: clientVisible,
        orderNumber: orderNumber,
        clientType: clientType,
        tasksTotal: tasksTotal ?? this.tasksTotal,
        tasksDone: tasksDone ?? this.tasksDone,
        documentsCount: documentsCount ?? this.documentsCount,
        unreadMessages: unreadMessages ?? this.unreadMessages,
      );
}

/// Tarea de expediente (docs/02 §4).
class CaseTask {
  const CaseTask({
    required this.id,
    required this.caseFileId,
    required this.title,
    this.description,
    this.status = 'Todo',
    this.priority = 'Normal',
    this.dueAt,
    this.completedAt,
    this.assignedToName,
    this.sortOrder = 0,
    this.clientVisible = true,
    this.clientActionable = false,
  });

  final String id;
  final String caseFileId;
  final String title;
  final String? description;
  final String status;
  final String priority;
  final DateTime? dueAt;
  final DateTime? completedAt;
  final String? assignedToName;
  final int sortOrder;
  final bool clientVisible;

  /// Si el cliente puede marcarla como completada desde el app.
  final bool clientActionable;

  bool get isDone => status == 'Done';
  bool get isOverdue {
    if (dueAt == null || isDone) return false;
    return dueAt!.isBefore(DateTime.now().toUtc());
  }

  factory CaseTask.fromJson(JsonMap json) => CaseTask(
        id: asStringOr(json['id'], ''),
        caseFileId: asStringOr(json['caseFileId'], ''),
        title: asStringOr(json['title'], 'Tarea'),
        description: asString(json['description']),
        status: asStringOr(json['status'], 'Todo'),
        priority: asStringOr(json['priority'], 'Normal'),
        dueAt: asDate(json['dueAt']),
        completedAt: asDate(json['completedAt']),
        assignedToName: asString(json['assignedToName']),
        sortOrder: asIntOr(json['sortOrder'], 0),
        clientVisible: asBool(json['clientVisible'], fallback: true),
        clientActionable: asBool(json['clientActionable']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'caseFileId': caseFileId,
        'title': title,
        'description': description,
        'status': status,
        'priority': priority,
        'dueAt': dueAt?.toIso8601String(),
        'completedAt': completedAt?.toIso8601String(),
        'assignedToName': assignedToName,
        'sortOrder': sortOrder,
        'clientVisible': clientVisible,
        'clientActionable': clientActionable,
      };

  CaseTask copyWith({String? status, DateTime? completedAt}) => CaseTask(
        id: id,
        caseFileId: caseFileId,
        title: title,
        description: description,
        status: status ?? this.status,
        priority: priority,
        dueAt: dueAt,
        completedAt: completedAt ?? this.completedAt,
        assignedToName: assignedToName,
        sortOrder: sortOrder,
        clientVisible: clientVisible,
        clientActionable: clientActionable,
      );
}

/// Evento del timeline inmutable (docs/02 §4 `CaseEvents`).
class CaseEvent {
  const CaseEvent({
    required this.id,
    required this.caseFileId,
    required this.type,
    required this.title,
    this.description,
    this.actorName,
    this.createdAt,
    this.clientVisible = true,
    this.metadata = const <String, dynamic>{},
  });

  final String id;
  final String caseFileId;
  final String type;
  final String title;
  final String? description;
  final String? actorName;
  final DateTime? createdAt;
  final bool clientVisible;
  final JsonMap metadata;

  /// `true` cuando el evento lo generó el sistema (no una persona).
  bool get isSystem => actorName == null || actorName!.isEmpty;

  factory CaseEvent.fromJson(JsonMap json) => CaseEvent(
        id: asStringOr(json['id'], ''),
        caseFileId: asStringOr(json['caseFileId'], ''),
        type: asStringOr(json['type'], 'Note'),
        title: asStringOr(json['title'], 'Actuación'),
        description: asString(json['description']),
        actorName: asString(json['actorName']),
        createdAt: asDate(json['createdAt']),
        clientVisible: asBool(json['clientVisible'], fallback: true),
        metadata: asMap(json['metadata']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'caseFileId': caseFileId,
        'type': type,
        'title': title,
        'description': description,
        'actorName': actorName,
        'createdAt': createdAt?.toIso8601String(),
        'clientVisible': clientVisible,
        'metadata': metadata,
      };
}

/// Detalle completo de un expediente (`GET /me/cases/{id}`).
class CaseFileDetail {
  const CaseFileDetail({
    required this.caseFile,
    this.timeline = const <CaseEvent>[],
    this.tasks = const <CaseTask>[],
    this.documents = const <DocumentItem>[],
  });

  final CaseFile caseFile;
  final List<CaseEvent> timeline;
  final List<CaseTask> tasks;
  final List<DocumentItem> documents;

  factory CaseFileDetail.fromJson(JsonMap json) {
    final base = json.containsKey('caseFile') ? asMap(json['caseFile']) : json;
    return CaseFileDetail(
      caseFile: CaseFile.fromJson(base),
      timeline: asList(json['timeline']).map(CaseEvent.fromJson).toList(),
      tasks: asList(json['tasks']).map(CaseTask.fromJson).toList(),
      documents: asList(json['documents']).map(DocumentItem.fromJson).toList(),
    );
  }
}
