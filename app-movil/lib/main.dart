import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_config.dart';
import 'core/providers/auth_provider.dart';
import 'core/providers/core_providers.dart';
import 'core/providers/realtime_provider.dart';
import 'core/router/app_router.dart';
import 'core/theme/gh_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: GhContadoresApp()));
}

/// Raíz de la aplicación: tema, idioma, escalado de texto y arranque.
class GhContadoresApp extends ConsumerStatefulWidget {
  const GhContadoresApp({super.key});

  @override
  ConsumerState<GhContadoresApp> createState() => _GhContadoresAppState();
}

class _GhContadoresAppState extends ConsumerState<GhContadoresApp> {
  bool _bootstrapped = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    if (_bootstrapped) return;
    _bootstrapped = true;

    // 1) Centro de notificaciones local (tolerante a la ausencia de Firebase).
    //
    // No se espera: el registro del plugin puede tardar en algunos
    // dispositivos y en los tests no hay canal de plataforma. Se lanza y el
    // arranque continúa, así el splash nunca se queda esperando.
    unawaited(ref.read(pushServiceProvider).init());

    // 2) Sesión guardada + catálogo del modo demo listo antes de pintar.
    await ref.read(apiBootstrapProvider.future);
    if (!mounted) return;
    // El router necesita saber si el onboarding ya se vio.
    await loadOnboardingDone(ref);
    if (!mounted) return;
    await ref.read(authProvider.notifier).bootstrap();
    if (!mounted) return;

    // 3) Puente de tiempo real (SignalR o simulado) + polling de respaldo.
    ref.read(realtimeBridgeProvider);

    final user = ref.read(authProvider).user;
    if (user != null) {
      await ref.read(realtimeServiceProvider).connect(
            userId: user.id,
            accessToken: ref.read(tokenStoreProvider).accessToken,
          );
      if (!mounted) return;
    }

    // 4) Deep link cuando el usuario abre desde una notificación.
    ref.read(pushServiceProvider).onNotificationTap = (payload) {
      final link = AppRoutes.normalizeDeepLink(payload.deepLink);
      if (link != null) {
        ref.read(realtimeBannerDeepLinkProvider.notifier).state = link;
      }
    };
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);

    return _SessionExpiryListener(
      child: MaterialApp.router(
        title: AppConfig.appName,
        debugShowCheckedModeBanner: false,
        theme: GhTheme.light(),
        darkTheme: GhTheme.dark(),
        themeMode: themeMode,
        routerConfig: router,
        locale: const Locale('es', 'CR'),
        supportedLocales: const <Locale>[
          Locale('es', 'CR'),
          Locale('es'),
          Locale('en'),
        ],
        localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        builder: (context, child) {
          // Respeta el escalado de texto del sistema, acotando los extremos
          // para que nada se desborde con tamaños muy grandes.
          final media = MediaQuery.of(context);
          return MediaQuery(
            data: media.copyWith(
              textScaler: media.textScaler.clamp(
                minScaleFactor: 0.85,
                maxScaleFactor: 1.6,
              ),
            ),
            child: child ?? const SizedBox.shrink(),
          );
        },
      ),
    );
  }
}

/// Cierra la sesión cuando el refresh token deja de ser válido.
///
/// `ref.listen` solo puede usarse dentro de un `build`, de ahí este widget.
class _SessionExpiryListener extends ConsumerWidget {
  const _SessionExpiryListener({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<int>(sessionExpiredProvider, (previous, next) {
      if (previous != next && next != 0) {
        ref.read(authProvider.notifier).forceLogout(
              message: 'Tu sesión expiró. Inicia sesión de nuevo.',
            );
      }
    });
    return child;
  }
}

