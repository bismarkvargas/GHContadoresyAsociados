import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/widgets/gh_branding.dart';

/// Onboarding de 3 pasos con ilustraciones vectoriales propias.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final PageController _controller = PageController();
  int _index = 0;

  static const List<_Slide> _slides = <_Slide>[
    _Slide(
      illustration: GhIllustration.accounting,
      title: 'Tus trámites, bajo control',
      description:
          'Contabilidad, declaraciones y estados financieros con un expediente '
          'digital donde ves el avance en tiempo real.',
      bullets: <String>[
        'Expediente con timeline de actuaciones',
        'Recordatorios de vencimientos',
        'Documentos centralizados y seguros',
      ],
    ),
    _Slide(
      illustration: GhIllustration.legal,
      title: 'Firma legal y municipal',
      description:
          'Constitución de sociedades, poderes, contratos y trámites ante SUGEF, '
          'ACAM, MEIC, ATV, CCSS y municipalidades.',
      bullets: <String>[
        'Precio en USD desde el catálogo',
        'Responsable asignado por caso',
        'Mensajería directa con la firma',
      ],
    ),
    _Slide(
      illustration: GhIllustration.tax,
      title: 'Compra y da seguimiento',
      description:
          'Contrata servicios en línea, paga con tarjeta, SINPE Móvil o '
          'transferencia y recibe avisos en tu teléfono.',
      bullets: <String>[
        'Checkout con pasarela simulada',
        'Notificaciones push por evento',
        'Historial de compras y recibos',
      ],
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    await ref.read(tokenStoreProvider).setOnboardingDone();
    if (!mounted) return;
    // El redirect del router envía a /home si ya hay sesión activa.
    context.go(AppRoutes.services);
  }

  void _next() {
    if (_index == _slides.length - 1) {
      _finish();
      return;
    }
    _controller.nextPage(
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isLast = _index == _slides.length - 1;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
              child: Row(
                children: <Widget>[
                  const GhLogo(size: 34),
                  const Spacer(),
                  TextButton(
                    onPressed: _finish,
                    child: const Text('Omitir'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (context, i) {
                  final slide = _slides[i];
                  return SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        const SizedBox(height: 12),
                        GhIllustrationView(
                          illustration: slide.illustration,
                          size: 200,
                        ),
                        const SizedBox(height: 28),
                        Text(
                          slide.title,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.displayLarge?.copyWith(
                            fontSize: 26,
                            height: 1.15,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          slide.description,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 24),
                        for (final bullet in slide.bullets)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Row(
                              children: <Widget>[
                                Container(
                                  width: 22,
                                  height: 22,
                                  decoration: const BoxDecoration(
                                    color: GhTokens.primary50,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.check_rounded,
                                    size: 14,
                                    color: GhTokens.primary,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    bullet,
                                    style: theme.textTheme.bodyMedium,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        const SizedBox(height: 16),
                      ],
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
              child: Column(
                children: <Widget>[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      for (int i = 0; i < _slides.length; i++)
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 220),
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          width: i == _index ? 26 : 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: i == _index
                                ? GhTokens.primary
                                : theme.colorScheme.outlineVariant,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _next,
                      child: Text(isLast ? 'Explorar servicios' : 'Continuar'),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => context.push(AppRoutes.register),
                      child: const Text('Solicitar una cuenta'),
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextButton(
                    onPressed: () => context.push(AppRoutes.login),
                    child: const Text('Ya tengo cuenta · Iniciar sesión'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Slide {
  const _Slide({
    required this.illustration,
    required this.title,
    required this.description,
    required this.bullets,
  });

  final GhIllustration illustration;
  final String title;
  final String description;
  final List<String> bullets;
}
