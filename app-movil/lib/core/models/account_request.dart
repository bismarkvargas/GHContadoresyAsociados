import '../../core/utils/json.dart';
import 'user.dart' show ClientType, clientTypeFrom, clientTypeToJson;

/// Solicitud de cuenta desde el app (docs/02 §2).
///
/// La API puede aprobarla automáticamente (`autoApproved`) cuando el panel tiene
/// el registro en modo abierto; en ese caso devuelve `canLogin` y, si procede,
/// una `temporaryPassword` para iniciar sesión de inmediato.
class AccountRequest {
  const AccountRequest({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.idNumber,
    required this.clientType,
    required this.trackingCode,
    this.company,
    this.message,
    this.status = 'Pending',
    this.rejectionReason,
    this.source = 'app',
    this.createdAt,
    this.reviewedAt,
    this.autoApproved = false,
    this.canLogin = false,
    this.temporaryPassword,
  });

  final String id;
  final String fullName;
  final String email;
  final String phone;
  final String idNumber;
  final ClientType clientType;
  final String trackingCode;
  final String? company;
  final String? message;
  final String status; // Pending | Approved | Rejected | Cancelled
  final String? rejectionReason;
  final String source;
  final DateTime? createdAt;
  final DateTime? reviewedAt;

  /// `true` cuando la cuenta quedó activa sin intervención del administrador.
  final bool autoApproved;

  /// `true` cuando el usuario puede iniciar sesión de inmediato.
  final bool canLogin;

  /// Contraseña temporal devuelta por la API (modo automático).
  final String? temporaryPassword;

  bool get isPending => status == 'Pending';
  bool get isApproved => status == 'Approved';
  bool get isRejected => status == 'Rejected';

  factory AccountRequest.fromJson(JsonMap json) => AccountRequest(
        id: asStringOr(json['id'], ''),
        fullName: asStringOr(json['fullName'], ''),
        email: asStringOr(json['email'], ''),
        phone: asStringOr(json['phone'], ''),
        idNumber: asStringOr(json['idNumber'], ''),
        clientType: clientTypeFrom(asString(json['clientType'])),
        trackingCode: asStringOr(json['trackingCode'], ''),
        company: asString(json['company']),
        message: asString(json['message']),
        status: asStringOr(json['status'], 'Pending'),
        rejectionReason: asString(json['rejectionReason']),
        source: asStringOr(json['source'], 'app'),
        createdAt: asDate(json['createdAt']),
        reviewedAt: asDate(json['reviewedAt']),
        autoApproved: asBool(json['autoApproved']),
        canLogin: asBool(json['canLogin']),
        temporaryPassword: asString(json['temporaryPassword']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'fullName': fullName,
        'email': email,
        'phone': phone,
        'idNumber': idNumber,
        'clientType': clientTypeToJson(clientType),
        'trackingCode': trackingCode,
        'company': company,
        'message': message,
        'status': status,
        'rejectionReason': rejectionReason,
        'source': source,
        'createdAt': createdAt?.toIso8601String(),
        'reviewedAt': reviewedAt?.toIso8601String(),
        'autoApproved': autoApproved,
        'canLogin': canLogin,
        'temporaryPassword': temporaryPassword,
      };

  AccountRequest copyWith({
    String? status,
    String? rejectionReason,
    DateTime? reviewedAt,
    bool? autoApproved,
    bool? canLogin,
    String? temporaryPassword,
  }) =>
      AccountRequest(
        id: id,
        fullName: fullName,
        email: email,
        phone: phone,
        idNumber: idNumber,
        clientType: clientType,
        trackingCode: trackingCode,
        company: company,
        message: message,
        status: status ?? this.status,
        rejectionReason: rejectionReason ?? this.rejectionReason,
        source: source,
        createdAt: createdAt,
        reviewedAt: reviewedAt ?? this.reviewedAt,
        autoApproved: autoApproved ?? this.autoApproved,
        canLogin: canLogin ?? this.canLogin,
        temporaryPassword: temporaryPassword ?? this.temporaryPassword,
      );
}

/// Solicitud de cotización (docs/02 §8 `QuoteRequests`).
class QuoteRequest {
  const QuoteRequest({
    required this.fullName,
    required this.email,
    required this.message,
    this.phone,
    this.company,
    this.serviceId,
    this.serviceName,
  });

  final String fullName;
  final String email;
  final String message;
  final String? phone;
  final String? company;
  final String? serviceId;
  final String? serviceName;

  JsonMap toJson() => <String, dynamic>{
        'fullName': fullName,
        'email': email,
        'message': message,
        'phone': phone,
        'company': company,
        'serviceId': serviceId,
        'serviceName': serviceName,
      };
}
