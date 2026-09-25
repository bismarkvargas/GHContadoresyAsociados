import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/auth_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/async_guard.dart';
import '../../core/widgets/gh_branding.dart';

/// Pantalla de arranque: decide a dónde ir según sesión, onboarding y estado
/// de la cuenta (docs/03 §7).
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _decide());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _decide() async {
    final stopwatch = Stopwatch()..start();

    // Espera tolerante: la app nunca se queda pegada en el splash.
    await AsyncGuard.retry<void>(
      () async {
        await AsyncGuard.timeout(
          ref.read(apiBootstrapProvider.future),
          limit: const Duration(seconds: 12),
        );
        await AsyncGuard.timeout(
          ref.read(authProvider.notifier).bootstrap(),
          limit: const Duration(seconds: 12),
        );
      },
      attempts: 2,
      initialDelay: const Duration(milliseconds: 400),
      shouldRetry: (_) => true,
    ).catchError((_) {});

    if (mounted) {
      setState(() => _status = 'Verificando tu sesión…');
    }

    final store = ref.read(tokenStoreProvider);
    final onboardingDone = await store.isOnboardingDone();
    final auth = ref.read(authProvider);

    // Mínimo visible para que la animación de marca se aprecie.
    const minimum = Duration(milliseconds: 1400);
    if (stopwatch.elapsed < minimum) {
      await Future<void>.delayed(minimum - stopwatch.elapsed);
    }

    if (!mounted) return;

    if (!onboardingDone) {
      context.go(AppRoutes.onboarding);
      return;
    }

    switch (auth.stage) {
      case AuthStage.unknown:
      case AuthStage.unauthenticated:
        context.go(AppRoutes.services);
        break;
      case AuthStage.pending:
        context.go(AppRoutes.pendingApproval);
        break;
      case AuthStage.active:
        context.go(AppRoutes.home);
        break;
      case AuthStage.suspended:
      case AuthStage.rejected:
        context.go(AppRoutes.login);
        break;
    }
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
            Positioned(
              right: -40,
              top: -30,
              child: GhWatermark(size: 220),
            ),
            Positioned(
              left: -60,
              bottom: -40,
              child: GhWatermark(size: 180),
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
                        child: const GhLogo(size: 108),
                      ),
                    ),
                    const SizedBox(height: 24),
                    FadeTransition(
                      opacity: _fade,
                      child: Column(
                        children: <Widget>[
                          Text(
                            'GH Contadores',
                            style: theme.textTheme.displayLarge?.copyWith(
                              letterSpacing: -0.8,
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
