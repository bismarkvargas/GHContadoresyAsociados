import '../../core/utils/json.dart';

/// Estado de la cuenta (docs/02 §1): `Pending=0, Active=1, Suspended=2, Rejected=3`.
enum UserStatus { pending, active, suspended, rejected }

UserStatus userStatusFrom(String? raw) {
  switch (raw) {
    case 'Active':
      return UserStatus.active;
    case 'Suspended':
      return UserStatus.suspended;
    case 'Rejected':
      return UserStatus.rejected;
    case 'Pending':
    default:
      return UserStatus.pending;
  }
}

String userStatusToJson(UserStatus status) {
  switch (status) {
    case UserStatus.active:
      return 'Active';
    case UserStatus.suspended:
      return 'Suspended';
    case UserStatus.rejected:
      return 'Rejected';
    case UserStatus.pending:
      return 'Pending';
  }
}

/// Tipo de cliente (docs/02 §3).
enum ClientType { individual, company, foreignInvestor }

ClientType clientTypeFrom(String? raw) {
  switch (raw) {
    case 'Company':
      return ClientType.company;
    case 'ForeignInvestor':
      return ClientType.foreignInvestor;
    case 'Individual':
    default:
      return ClientType.individual;
  }
}

String clientTypeToJson(ClientType type) {
  switch (type) {
    case ClientType.company:
      return 'Company';
    case ClientType.foreignInvestor:
      return 'ForeignInvestor';
    case ClientType.individual:
      return 'Individual';
  }
}

String clientTypeLabel(ClientType type) {
  switch (type) {
    case ClientType.company:
      return 'Persona jurídica';
    case ClientType.foreignInvestor:
      return 'Inversionista extranjero';
    case ClientType.individual:
      return 'Persona física';
  }
}

/// Usuario del sistema.
class AppUser {
  const AppUser({
    required this.id,
    required this.fullName,
    required this.email,
    this.phone,
    this.idNumber,
    this.avatarUrl,
    this.status = UserStatus.pending,
    this.isStaff = false,
    this.clientId,
    this.locale = 'es-CR',
    this.timeZone = 'America/Costa_Rica',
    this.clientType = ClientType.individual,
    this.companyName,
    this.address,
    this.province,
    this.canton,
    this.district,
    this.createdAt,
  });

  final String id;
  final String fullName;
  final String email;
  final String? phone;
  final String? idNumber;
  final String? avatarUrl;
  final UserStatus status;
  final bool isStaff;
  final String? clientId;
  final String locale;
  final String timeZone;
  final ClientType clientType;
  final String? companyName;
  final String? address;
  final String? province;
  final String? canton;
  final String? district;
  final DateTime? createdAt;

  bool get isActive => status == UserStatus.active;

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return 'GH';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  String get firstName {
    final parts = fullName.trim().split(RegExp(r'\s+'));
    return parts.isEmpty ? fullName : parts.first;
  }

  factory AppUser.fromJson(JsonMap json) => AppUser(
        id: asStringOr(json['id'], ''),
        fullName: asStringOr(json['fullName'], 'Cliente GH'),
        email: asStringOr(json['email'], ''),
        phone: asString(json['phone']),
        idNumber: asString(json['idNumber']),
        avatarUrl: asString(json['avatarUrl']),
        status: userStatusFrom(asString(json['status'])),
        isStaff: asBool(json['isStaff']),
        clientId: asString(json['clientId']),
        locale: asStringOr(json['locale'], 'es-CR'),
        timeZone: asStringOr(json['timeZone'], 'America/Costa_Rica'),
        clientType: clientTypeFrom(asString(json['clientType'])),
        companyName: asString(json['companyName']),
        address: asString(json['address']),
        province: asString(json['province']),
        canton: asString(json['canton']),
        district: asString(json['district']),
        createdAt: asDate(json['createdAt']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'fullName': fullName,
        'email': email,
        'phone': phone,
        'idNumber': idNumber,
        'avatarUrl': avatarUrl,
        'status': userStatusToJson(status),
        'isStaff': isStaff,
        'clientId': clientId,
        'locale': locale,
        'timeZone': timeZone,
        'clientType': clientTypeToJson(clientType),
        'companyName': companyName,
        'address': address,
        'province': province,
        'canton': canton,
        'district': district,
        'createdAt': createdAt?.toIso8601String(),
      };

  AppUser copyWith({
    String? fullName,
    String? email,
    String? phone,
    String? idNumber,
    String? avatarUrl,
    UserStatus? status,
    ClientType? clientType,
    String? companyName,
    String? address,
    String? province,
    String? canton,
    String? district,
  }) =>
      AppUser(
        id: id,
        fullName: fullName ?? this.fullName,
        email: email ?? this.email,
        phone: phone ?? this.phone,
        idNumber: idNumber ?? this.idNumber,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        status: status ?? this.status,
        isStaff: isStaff,
        clientId: clientId,
        locale: locale,
        timeZone: timeZone,
        clientType: clientType ?? this.clientType,
        companyName: companyName ?? this.companyName,
        address: address ?? this.address,
        province: province ?? this.province,
        canton: canton ?? this.canton,
        district: district ?? this.district,
        createdAt: createdAt,
      );
}

/// Sesión autenticada (respuesta de `/auth/login` y `/auth/refresh`).
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
    required this.user,
    this.roles = const <String>[],
    this.permissions = const <String>[],
  });

  final String accessToken;
  final String refreshToken;
  final DateTime expiresAt;
  final AppUser user;
  final List<String> roles;
  final List<String> permissions;

  bool get isExpiring =>
      expiresAt.isBefore(DateTime.now().toUtc().add(const Duration(minutes: 2)));

  factory AuthSession.fromJson(JsonMap json) {
    final map = asMap(json['user'] is Map ? json['user'] : json);
    return AuthSession(
      accessToken: asStringOr(json['accessToken'], ''),
      refreshToken: asStringOr(json['refreshToken'], ''),
      expiresAt: asDate(json['expiresAt']) ??
          DateTime.now().toUtc().add(const Duration(minutes: 60)),
      user: AppUser.fromJson(map),
      roles: asStringList(json['roles']),
      permissions: asStringList(json['permissions']),
    );
  }

  JsonMap toJson() => <String, dynamic>{
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'expiresAt': expiresAt.toIso8601String(),
        'user': user.toJson(),
        'roles': roles,
        'permissions': permissions,
      };

  AuthSession copyWith({
    String? accessToken,
    String? refreshToken,
    DateTime? expiresAt,
    AppUser? user,
  }) =>
      AuthSession(
        accessToken: accessToken ?? this.accessToken,
        refreshToken: refreshToken ?? this.refreshToken,
        expiresAt: expiresAt ?? this.expiresAt,
        user: user ?? this.user,
        roles: roles,
        permissions: permissions,
      );
}
