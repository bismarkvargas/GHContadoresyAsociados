import '../../core/utils/json.dart';

/// Documento del cliente o del expediente (docs/02 §5).
class DocumentItem {
  const DocumentItem({
    required this.id,
    required this.originalName,
    required this.category,
    this.caseFileId,
    this.caseCode,
    this.contentType = 'application/pdf',
    this.sizeBytes = 0,
    this.version = 1,
    this.isCurrent = true,
    this.uploadedByName,
    this.uploadedAt,
    this.clientVisible = true,
    this.url,
    this.localPath,
    this.sha256,
  });

  final String id;
  final String originalName;
  final String category;
  final String? caseFileId;
  final String? caseCode;
  final String contentType;
  final int sizeBytes;
  final int version;
  final bool isCurrent;
  final String? uploadedByName;
  final DateTime? uploadedAt;
  final bool clientVisible;

  /// URL firmada (HMAC, 15 min) o asset local en modo demo.
  final String? url;

  /// Ruta local (modo demo / archivos subidos desde el dispositivo).
  final String? localPath;
  final String? sha256;

  bool get isPdf => contentType == 'application/pdf' ||
      originalName.toLowerCase().endsWith('.pdf');
  bool get isImage =>
      contentType.startsWith('image/') ||
      RegExp(r'\.(png|jpe?g|webp)$', caseSensitive: false).hasMatch(originalName);

  String get extension =>
      originalName.contains('.') ? originalName.split('.').last.toUpperCase() : 'FILE';

  factory DocumentItem.fromJson(JsonMap json) => DocumentItem(
        id: asStringOr(json['id'], ''),
        originalName: asStringOr(json['originalName'], 'documento.pdf'),
        category: asStringOr(json['category'], 'Otro'),
        caseFileId: asString(json['caseFileId']),
        caseCode: asString(json['caseCode']),
        contentType: asStringOr(json['contentType'], 'application/pdf'),
        sizeBytes: asIntOr(json['sizeBytes'], 0),
        version: asIntOr(json['version'], 1),
        isCurrent: asBool(json['isCurrent'], fallback: true),
        uploadedByName: asString(json['uploadedByName']),
        uploadedAt: asDate(json['uploadedAt']),
        clientVisible: asBool(json['clientVisible'], fallback: true),
        url: asString(json['url']),
        localPath: asString(json['localPath']),
        sha256: asString(json['sha256']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'originalName': originalName,
        'category': category,
        'caseFileId': caseFileId,
        'caseCode': caseCode,
        'contentType': contentType,
        'sizeBytes': sizeBytes,
        'version': version,
        'isCurrent': isCurrent,
        'uploadedByName': uploadedByName,
        'uploadedAt': uploadedAt?.toIso8601String(),
        'clientVisible': clientVisible,
        'url': url,
        'localPath': localPath,
        'sha256': sha256,
      };

  DocumentItem copyWith({bool? clientVisible, String? caseCode}) => DocumentItem(
        id: id,
        originalName: originalName,
        category: category,
        caseFileId: caseFileId,
        caseCode: caseCode ?? this.caseCode,
        contentType: contentType,
        sizeBytes: sizeBytes,
        version: version,
        isCurrent: isCurrent,
        uploadedByName: uploadedByName,
        uploadedAt: uploadedAt,
        clientVisible: clientVisible ?? this.clientVisible,
        url: url,
        localPath: localPath,
        sha256: sha256,
      );
}

/// Categorías documentales permitidas (docs/02 §5).
class DocumentCategories {
  const DocumentCategories._();

  static const List<String> all = <String>[
    'Expediente',
    'Identidad',
    'Contable',
    'Tributario',
    'Legal',
    'Municipal',
    'Contrato',
    'Comprobante',
    'Otro',
  ];

  /// Categorías que el cliente puede subir desde el app.
  static const List<String> clientUploadable = <String>[
    'Identidad',
    'Contable',
    'Tributario',
    'Legal',
    'Municipal',
    'Comprobante',
    'Otro',
  ];
}
