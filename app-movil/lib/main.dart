import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_config.dart';
import 'core/providers/auth_provider.dart';
import 'core/providers/core_providers.dart';
import 'core/providers/push_permission_provider.dart';
import 'core/providers/realtime_provider.dart';
import 'core/push/push_permission_service.dart';
import 'core/router/app_router.dart';
import 'core/theme/gh_theme.dart';
import 'core/widgets/push_permission_ui.dart';

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

    // 5) Push: Firebase tolerante al arranque + estado del permiso.
    //
    // No se pide ningún permiso aquí (molestaría en arranques en frío): solo se
    // consulta el estado y, si ya está concedido, se registra el token.
    unawaited(_preparePush());
  }

  /// Inicializa Firebase, lee el estado del permiso y registra el token si ya
  /// estaba concedido. Todo tolerante a fallos.
  Future<void> _preparePush() async {
    try {
      await loadPushAskedFromWidget(ref);
      if (!mounted) return;
      final status =
          await ref.read(pushPermissionProvider.notifier).refresh();
      if (!mounted) return;
      if (status.isGranted && ref.read(authProvider).isAuthenticated) {
        await ref.read(pushPermissionProvider.notifier).registerToken();
      }
    } catch (e) {
      debugPrint('[Push] preparación tolerante falló: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);

    return _SessionExpiryListener(
      child: _PushPermissionGate(
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
      ),
    );
  }
}

/// Ofrece activar las notificaciones **justo después de iniciar sesión**.
///
/// Solo se muestra cuando: hay sesión activa, el permiso aún no se ha decidido,
/// no se ha propuesto antes y no hay un diálogo abierto. Así no se pide en
/// arranques en frío ni a un invitado (que no tiene trámites que seguir).
class _PushPermissionGate extends ConsumerStatefulWidget {
  const _PushPermissionGate({required this.child});

  final Widget child;

  @override
  ConsumerState<_PushPermissionGate> createState() =>
      _PushPermissionGateState();
}

class _PushPermissionGateState extends ConsumerState<_PushPermissionGate> {
  bool _showing = false;

  /// Pide el token y lo registra en la API cuando ya hay permiso.
  Future<void> _registerToken() async {
    try {
      await ref.read(pushPermissionProvider.notifier).registerToken();
    } catch (e) {
      debugPrint('[Push] registro de token omitido: $e');
    }
  }

  Future<void> _maybeOffer() async {
    if (_showing || !mounted) return;

    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) return;
    // Con la cuenta en revisión todavía no hay trámites que seguir.
    if (auth.stage == AuthStage.pending) return;

    // El estado puede seguir cargándose: se consulta de forma tolerante.
    final status = await ref.read(pushPermissionProvider.notifier).refresh();
    if (!mounted) return;

    if (status.isGranted) {
      // Ya hay permiso: se asegura el token en este dispositivo.
      await _registerToken();
      return;
    }
    // Solo se ofrece cuando el sistema aún puede mostrar el diálogo.
    if (status != PushPermissionStatus.notDetermined) return;
    if (ref.read(pushAskedProvider)) return;

    _showing = true;
    // Se espera al siguiente frame para que el home ya esté montado.
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!mounted) {
      _showing = false;
      return;
    }

    // El contexto se lee *después* de la espera y se valida con su propio
    // `mounted` (el del Navigator), no con el del State.
    final navigator = rootNavigatorKey.currentContext;
    if (navigator == null || !navigator.mounted) {
      _showing = false;
      return;
    }
    try {
      await showPushPermissionDialog(navigator, ref);
    } catch (e) {
      debugPrint('[Push] no se pudo mostrar el aviso: $e');
    } finally {
      _showing = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Al pasar a sesión activa (login o restauración) se ofrece el permiso.
    ref.listen<AuthState>(authProvider, (previous, next) {
      final justLoggedIn = (previous?.isAuthenticated ?? false) == false &&
          next.isAuthenticated;
      if (justLoggedIn || next.stage == AuthStage.active) {
        unawaited(_maybeOffer());
      }
    });

    // Si la app arranca ya con sesión restaurada, se ofrece una vez.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ref.read(authProvider).isAuthenticated) {
        unawaited(_maybeOffer());
      }
    });

    return widget.child;
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

