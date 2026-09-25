/// Configuración global de la app.
///
/// Todos los valores pueden sobreescribirse en tiempo de compilación:
///   flutter run --dart-define=API_BASE_URL=https://mi-servidor/api/v1
///   flutter run --dart-define=USE_MOCKS=false
class AppConfig {
  const AppConfig._();

  /// URL base de la API (contrato docs/03-contrato-api.md).
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://demostracion.es/ghcontadores/api/v1',
  );

  /// Modo demo: catálogo real + datos simulados, sin backend.
  /// Se desactiva con --dart-define=USE_MOCKS=false
  static const bool useMocks = bool.fromEnvironment(
    'USE_MOCKS',
    defaultValue: true,
  );

  /// Hub SignalR de tiempo real (docs/03 §5).
  static const String realtimeHubPath = '/hubs/realtime';

  /// Fallback de polling cuando el socket cae o estamos en modo demo.
  static const Duration pollingInterval = Duration(seconds: 15);

  /// Nombre de la app.
  static const String appName = 'GH Contadores';

  /// Moneda base del catálogo.
  static const String baseCurrency = 'USD';

  /// Tipo de cambio USD → CRC (ajustable desde /public/site en producción).
  static const double usdToCrc = 512.0;

  /// Impuesto al valor agregado (IVA) de Costa Rica.
  static const double defaultTaxRate = 13.0;

  /// Tiempo máximo de espera de red.
  static const Duration connectTimeout = Duration(seconds: 20);
  static const Duration receiveTimeout = Duration(seconds: 30);

  /// Tamaño máximo de subida de documentos (25 MB, docs/02 §5).
  static const int maxUploadBytes = 25 * 1024 * 1024;

  /// Claves de almacenamiento seguro.
  static const String kAccessToken = 'gh_access_token';
  static const String kRefreshToken = 'gh_refresh_token';
  static const String kExpiresAt = 'gh_expires_at';
  static const String kCachedUser = 'gh_cached_user';
  static const String kOnboardingDone = 'gh_onboarding_done';
  static const String kThemeMode = 'gh_theme_mode';
  static const String kLocale = 'gh_locale';
  static const String kLastTrackingCode = 'gh_last_tracking_code';

  /// Datos corporativos reales (docs/01 §1) usados en contacto directo.
  static const String contactPhonePrimary = '+50626536634';
  static const String contactPhoneSecondary = '+50688469454';
  static const String contactPhonePrimaryPretty = '+506 2653 6634';
  static const String contactPhoneSecondaryPretty = '+506 8846 9454';
  static const String contactEmailManagement = 'gustavo.ghcontadores@outlook.com';
  static const String contactEmailOrders = 'pedidos@ghcontadores.net';
  static const String contactAddress =
      'Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica';
  static const String contactTimezone = 'America/Costa_Rica';
  static const String website = 'https://www.ghcontadores.net';

  /// Prefijo telefónico de Costa Rica.
  static const String crDialCode = '+506';

  /// Límites de paginación.
  static const int pageSize = 12;
}
