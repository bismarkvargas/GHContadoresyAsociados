import '../../core/utils/json.dart';

/// Configuración del registro de cuentas (`GET /public/site` → `registration`).
///
/// El administrador decide desde el panel si el registro es abierto
/// (`automatic`, con `autoApprove: true`) o si requiere aprobación (`approval`).
class RegistrationConfig {
  const RegistrationConfig({
    this.mode = 'approval',
    this.autoApprove = false,
    this.message,
  });

  /// `automatic` (registro abierto) o `approval` (requiere aprobación).
  final String mode;

  /// `true` cuando la cuenta queda activa de inmediato tras registrarse.
  final bool autoApprove;

  /// Mensaje corporativo que el panel puede personalizar.
  final String? message;

  bool get isAutomatic => mode == 'automatic' || autoApprove;

  /// Titular de la pantalla de solicitud.
  String get headline => isAutomatic
      ? 'Cree su cuenta y empiece a comprar de inmediato'
      : 'Solicite su cuenta';

  /// Texto de apoyo: mensaje del panel si existe, si no uno por defecto.
  String get description {
    final custom = message?.trim();
    if (custom != null && custom.isNotEmpty) return custom;
    return isAutomatic
        ? 'Su cuenta se activa al instante: podrá contratar servicios y seguir '
            'sus trámites en línea.'
        : 'Un administrador revisará su solicitud y le avisaremos por correo y '
            'dentro de la app cuando su cuenta esté activa.';
  }

  factory RegistrationConfig.fromJson(JsonMap json) => RegistrationConfig(
        mode: asStringOr(json['mode'], 'approval'),
        autoApprove: asBool(json['autoApprove']),
        message: asString(json['message']),
      );

  JsonMap toJson() => <String, dynamic>{
        'mode': mode,
        'autoApprove': autoApprove,
        'message': message,
      };
}

/// Marca, contactos y monedas (`GET /public/site`).
class SiteInfo {
  const SiteInfo({
    this.name = 'GH Contadores y Asociados',
    this.tagline = 'En GH Contadores lo resolvemos por usted',
    this.about,
    this.address =
        'Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica',
    this.phonePrimary = '+506 2653 6634',
    this.phoneSecondary = '+506 8846 9454',
    this.emailManagement = 'gustavo.ghcontadores@outlook.com',
    this.emailOrders = 'pedidos@ghcontadores.net',
    this.whatsapp = '+50688469454',
    this.baseCurrency = 'USD',
    this.usdToCrc = 512,
    this.timeZone = 'America/Costa_Rica',
    this.website = 'https://www.ghcontadores.net',
    this.taxRate = 13,
    this.legalTerms,
    this.legalPrivacy,
    this.registration = const RegistrationConfig(),
  });

  final String name;
  final String tagline;
  final String? about;
  final String address;
  final String phonePrimary;
  final String phoneSecondary;
  final String emailManagement;
  final String emailOrders;
  final String whatsapp;
  final String baseCurrency;
  final double usdToCrc;
  final String timeZone;
  final String website;
  final double taxRate;
  final String? legalTerms;
  final String? legalPrivacy;

  /// Configuración de registro de cuentas definida por el administrador.
  final RegistrationConfig registration;

  factory SiteInfo.fromJson(JsonMap json) {
    const fallback = SiteInfo();
    return SiteInfo(
      name: asStringOr(json['name'], fallback.name),
      tagline: asStringOr(json['tagline'], fallback.tagline),
      about: asString(json['about']),
      address: asStringOr(json['address'], fallback.address),
      phonePrimary: asStringOr(json['phonePrimary'], fallback.phonePrimary),
      phoneSecondary: asStringOr(json['phoneSecondary'], fallback.phoneSecondary),
      emailManagement: asStringOr(json['emailManagement'], fallback.emailManagement),
      emailOrders: asStringOr(json['emailOrders'], fallback.emailOrders),
      whatsapp: asStringOr(json['whatsapp'], fallback.whatsapp),
      baseCurrency: asStringOr(json['baseCurrency'], fallback.baseCurrency),
      usdToCrc: asDoubleOr(json['usdToCrc'], fallback.usdToCrc),
      timeZone: asStringOr(json['timeZone'], fallback.timeZone),
      website: asStringOr(json['website'], fallback.website),
      taxRate: asDoubleOr(json['taxRate'], fallback.taxRate),
      legalTerms: asString(json['legalTerms']),
      legalPrivacy: asString(json['legalPrivacy']),
      registration: json['registration'] == null
          ? fallback.registration
          : RegistrationConfig.fromJson(asMap(json['registration'])),
    );
  }

  JsonMap toJson() => <String, dynamic>{
        'name': name,
        'tagline': tagline,
        'about': about,
        'address': address,
        'phonePrimary': phonePrimary,
        'phoneSecondary': phoneSecondary,
        'emailManagement': emailManagement,
        'emailOrders': emailOrders,
        'whatsapp': whatsapp,
        'baseCurrency': baseCurrency,
        'usdToCrc': usdToCrc,
        'timeZone': timeZone,
        'website': website,
        'taxRate': taxRate,
        'legalTerms': legalTerms,
        'legalPrivacy': legalPrivacy,
        'registration': registration.toJson(),
      };
}

/// Contadores y últimas novedades del home (`GET /me/dashboard`).
class DashboardSummary {
  const DashboardSummary({
    this.openCases = 0,
    this.pendingTasks = 0,
    this.newDocuments = 0,
    this.unreadMessages = 0,
    this.unreadNotifications = 0,
    this.pendingOrders = 0,
    this.featuredProducts = const <Map<String, dynamic>>[],
    this.recentCases = const <Map<String, dynamic>>[],
    this.upcomingTasks = const <Map<String, dynamic>>[],
    this.latestNotifications = const <Map<String, dynamic>>[],
    this.latestEvents = const <Map<String, dynamic>>[],
  });

  final int openCases;
  final int pendingTasks;
  final int newDocuments;
  final int unreadMessages;
  final int unreadNotifications;
  final int pendingOrders;
  final List<JsonMap> featuredProducts;
  final List<JsonMap> recentCases;
  final List<JsonMap> upcomingTasks;
  final List<JsonMap> latestNotifications;
  final List<JsonMap> latestEvents;

  factory DashboardSummary.fromJson(JsonMap json) => DashboardSummary(
        openCases: asIntOr(json['openCases'], 0),
        pendingTasks: asIntOr(json['pendingTasks'], 0),
        newDocuments: asIntOr(json['newDocuments'], 0),
        unreadMessages: asIntOr(json['unreadMessages'], 0),
        unreadNotifications: asIntOr(json['unreadNotifications'], 0),
        pendingOrders: asIntOr(json['pendingOrders'], 0),
        featuredProducts: asList(json['featuredProducts']),
        recentCases: asList(json['recentCases']),
        upcomingTasks: asList(json['upcomingTasks']),
        latestNotifications: asList(json['latestNotifications']),
        latestEvents: asList(json['latestEvents']),
      );
}
