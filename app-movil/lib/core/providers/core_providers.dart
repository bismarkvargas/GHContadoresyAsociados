import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../mock/mock_api_client.dart';
import '../mock/mock_seed.dart';
import '../models/catalog.dart';
import '../models/site_info.dart';
import '../models/user.dart';
import '../network/api_client.dart';
import '../network/dio_api_client.dart';
import '../push/push_service.dart';
import '../realtime/mock_realtime_service.dart';
import '../realtime/realtime_service.dart';
import '../storage/token_store.dart';

/// Almacenamiento de la sesión y preferencias.
final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

/// Modo demo activo (`--dart-define=USE_MOCKS=false` para desactivarlo).
final useMocksProvider = Provider<bool>((ref) => AppConfig.useMocks);

/// URL base efectiva de la API.
final apiBaseUrlProvider = Provider<String>((ref) => AppConfig.apiBaseUrl);

/// Cliente de API: mock en modo demo, Dio contra `/api/v1` en producción.
final apiClientProvider = Provider<ApiClient>((ref) {
  final store = ref.watch(tokenStoreProvider);

  if (AppConfig.useMocks) {
    return MockApiClient();
  }
  return DioApiClient(
    tokenStore: store,
    onSessionExpired: () {
      ref.read(sessionExpiredProvider.notifier).state =
          DateTime.now().millisecondsSinceEpoch;
    },
  );
});

/// Inicialización del cliente (carga el catálogo real en modo demo).
final apiBootstrapProvider = FutureProvider<ApiClient>((ref) async {
  final client = ref.watch(apiClientProvider);
  await ref.watch(tokenStoreProvider).load();
  if (client is MockApiClient) {
    await client.init();
  }
  return client;
});

/// Cambia de valor cuando la sesión debe cerrarse (refresh token inválido).
final sessionExpiredProvider = StateProvider<int>((ref) => 0);

/// Servicio de notificaciones locales + push.
final pushServiceProvider = Provider<LocalNotificationService>((ref) {
  final service = LocalNotificationService();
  ref.onDispose(service.cancelAll);
  return service;
});

/// Servicio de tiempo real (SignalR o simulado en modo demo).
final realtimeServiceProvider = Provider<RealtimeService>((ref) {
  final RealtimeService service;
  if (AppConfig.useMocks) {
    service = MockRealtimeService();
  } else {
    service = SignalRRealtimeService(
      accessToken: ref.read(tokenStoreProvider).accessToken,
    );
  }
  ref.onDispose(service.dispose);
  return service;
});

/// Estado de la conexión de tiempo real, expuesto a la UI.
final realtimeStatusProvider = StreamProvider<RealtimeStatus>((ref) {
  final service = ref.watch(realtimeServiceProvider);
  return service.status;
});

/// Información de marca y contactos (`/public/site`).
final siteInfoProvider = FutureProvider<SiteInfo>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  try {
    return await client.getSiteInfo();
  } catch (_) {
    return const SiteInfo();
  }
});

/// Modo de tema (claro/oscuro/sistema), persistido en preferencias.
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier(this._store) : super(ThemeMode.system) {
    _restore();
  }

  final TokenStore _store;

  Future<void> _restore() async {
    final saved = await _store.getThemeMode();
    switch (saved) {
      case 'light':
        state = ThemeMode.light;
        break;
      case 'dark':
        state = ThemeMode.dark;
        break;
      default:
        state = ThemeMode.system;
    }
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await _store.setThemeMode(mode.name);
  }

  Future<void> toggle() async {
    final isDark = state == ThemeMode.dark;
    await set(isDark ? ThemeMode.light : ThemeMode.dark);
  }
}

final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier(ref.watch(tokenStoreProvider));
});

/// Catálogo de categorías (4 reales, docs/01 §2).
final categoriesProvider = FutureProvider<List<ProductCategory>>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  return client.getCategories();
});

/// Banner in-app para mensajes de push en primer plano.
class InAppBanner {
  const InAppBanner({required this.payload, required this.id});

  final PushPayload payload;
  final int id;
}

final inAppBannerProvider = StateProvider<InAppBanner?>((ref) => null);

/// Nota de la cuenta demo mostrada en el perfil (modo demo).
final demoCredentialsProvider = Provider<String>((ref) {
  if (!AppConfig.useMocks) return '';
  return '${MockSeed.demoUser().email} · ${MockSeed.demoPassword}';
});
