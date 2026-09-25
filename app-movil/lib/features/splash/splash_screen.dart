import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/auth_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/async_guard.dart';
import '../../core/widgets/gh_branding.dart';
import '../../core/widgets/gh_logo.dart';

/// Mínimo de tiempo que el splash permanece visible para que la animación de
/// marca se aprecie. Es variable para que los tests puedan ponerlo a cero y no
/// dejar un `Future.delayed` pendiente al terminar.
@visibleForTesting
Duration splashMinimumVisible = const Duration(milliseconds: 1200);

/// Pantalla de arranque.
///
/// Mientras está visible: inicializa el cliente del modo demo (catálogo real),
/// restaura la sesión guardada y muestra la marca. Apenas el estado de sesión
/// queda decidido, el `redirect` del router envía a:
///  * `/onboarding` si el usuario aún no lo vio,
///  * `/services` (catálogo público) si no hay sesión,
///  * `/pending` si la cuenta espera aprobación,
///  * `/home` si la cuenta está `Active`.
///
/// El splash tiene un tope de tiempo: nunca bloquea la app más de lo previsto.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..forward();

  late final Animation<double> _fade = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0, 0.6, curve: Curves.easeOut),
  );

  late final Animation<double> _scale = Tween<double>(begin: 0.82, end: 1).animate(
    CurvedAnimation(
      parent: _controller,
      curve: const Interval(0, 0.7, curve: Curves.easeOutBack),
    ),
  );

  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0, 0.25),
    end: Offset.zero,
  ).animate(
    CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.3, 1, curve: Curves.easeOutCubic),
    ),
  );

  String _status = 'Preparando tu espacio de trabajo…';
  bool _bootstrapped = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Arranque tolerante: si algo falla, se avanza igual al destino por defecto.
  Future<void> _bootstrap() async {
    if (_bootstrapped) return;
    _bootstrapped = true;
    final stopwatch = Stopwatch()..start();

    try {
      await AsyncGuard.withTimeout(
        ref.read(apiBootstrapProvider.future),
        limit: const Duration(seconds: 12),
        label: 'splash.apiBootstrap',
      );
      await AsyncGuard.withTimeout(
        ref.read(authProvider.notifier).bootstrap(),
        limit: const Duration(seconds: 12),
        label: 'splash.authBootstrap',
      );
      if (ref.read(onboardingDoneProvider) == null) {
        await AsyncGuard.withTimeout(
          loadOnboardingDone(ref),
          limit: const Duration(seconds: 5),
          label: 'splash.onboarding',
        );
      }
    } catch (_) {
      // El modo demo y el catálogo público no dependen de la red.
    }

    if (mounted) {
      setState(() => _status = 'Verificando tu sesión…');
    }

    // Mínimo visible para que la animación de marca se aprecie.
    if (splashMinimumVisible > Duration.zero &&
        stopwatch.elapsed < splashMinimumVisible) {
      await Future<void>.delayed(splashMinimumVisible - stopwatch.elapsed);
    }

    if (!mounted) return;

    // El router ya navega al reaccionar al estado; este respaldo garantiza que
    // la app nunca se quede en el splash (por ejemplo si el redirect no corre).
    if (ref.read(authProvider).stage != AuthStage.unknown) {
      _fallbackNavigation();
    }
  }

  void _fallbackNavigation() {
    if (!mounted) return;
    final auth = ref.read(authProvider);
    final onboardingDone = ref.read(onboardingDoneProvider) ?? true;
    final location = switch (auth.stage) {
      AuthStage.active => AppRoutes.home,
      AuthStage.pending => AppRoutes.pendingApproval,
      AuthStage.suspended || AuthStage.rejected => AppRoutes.login,
      AuthStage.unauthenticated || AuthStage.unknown =>
        onboardingDone ? AppRoutes.services : AppRoutes.onboarding,
    };
    context.go(location);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final brightness = theme.brightness;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: brightness == Brightness.light
                ? <Color>[Colors.white, GhTokens.primary50, GhTokens.surface]
                : <Color>[
                    GhTokens.darkBackground,
                    const Color(0xFF241717),
                    GhTokens.darkSurface,
                  ],
          ),
        ),
        child: Stack(
          children: <Widget>[
            Positioned(right: -40, top: -30, child: GhWatermark(size: 220)),
            Positioned(left: -60, bottom: -40, child: GhWatermark(size: 180)),
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: GhTopStripe(),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  children: <Widget>[
                    const Spacer(flex: 3),
                    FadeTransition(
                      opacity: _fade,
                      child: ScaleTransition(
                        scale: _scale,
                        child: const GhLogoImage(height: 84),
                      ),
                    ),
                    const SizedBox(height: 24),
                    FadeTransition(
                      opacity: _fade,
                      child: Column(
                        children: <Widget>[
                          Text(
                            'GH Contadores y Asociados',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.headlineMedium?.copyWith(
                              letterSpacing: -0.4,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '& Asociados',
                            style: theme.textTheme.titleMedium?.copyWith(
                              letterSpacing: 4,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'En GH Contadores lo resolvemos por usted',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(flex: 2),
                    SlideTransition(
                      position: _slide,
                      child: Column(
                        children: <Widget>[
                          const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2.4),
                          ),
                          const SizedBox(height: 14),
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 250),
                            child: Text(
                              _status,
                              key: ValueKey<String>(_status),
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 40),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
