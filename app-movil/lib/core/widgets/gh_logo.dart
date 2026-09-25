import 'package:flutter/material.dart';

import '../theme/gh_tokens.dart';

/// Logotipos corporativos en `assets/brand/`.
enum GhLogoVariant {
  /// Logo horizontal con tipografía azul marino → fondos claros.
  horizontalAzul('assets/brand/logo-horizontal-azul.png'),

  /// Logo horizontal en blanco → fondos azul marino.
  horizontalBlanco('assets/brand/logo-horizontal-blanco.png'),

  /// Isotipo blanco → fondos de color o franjas.
  iconoBlanco('assets/brand/icono-blanco.png');

  const GhLogoVariant(this.asset);

  final String asset;
}

/// Logotipo de la firma usando los recursos oficiales.
///
/// Elige automáticamente la variante si no se indica: logo azul sobre fondos
/// claros y logo blanco sobre fondos oscuros o azul marino.
class GhLogoImage extends StatelessWidget {
  const GhLogoImage({
    super.key,
    this.variant,
    this.height = 44,
    this.onDarkBackground = false,
    this.semanticLabel = 'GH Contadores y Asociados',
  });

  final GhLogoVariant? variant;
  final double height;
  final bool onDarkBackground;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    final isDark = onDarkBackground ||
        Theme.of(context).brightness == Brightness.dark;
    final resolved = variant ??
        (isDark ? GhLogoVariant.horizontalBlanco : GhLogoVariant.horizontalAzul);

    return Semantics(
      image: true,
      label: semanticLabel,
      child: Image.asset(
        resolved.asset,
        height: height,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.medium,
        errorBuilder: (context, error, stack) => _FallbackMark(height: height),
      ),
    );
  }
}

/// Isotipo vectorial de respaldo si el recurso no está disponible.
class _FallbackMark extends StatelessWidget {
  const _FallbackMark({required this.height});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Container(
          width: height,
          height: height,
          decoration: BoxDecoration(
            color: GhTokens.primary,
            borderRadius: BorderRadius.circular(height * 0.28),
          ),
          alignment: Alignment.center,
          child: Text(
            'GH',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: height * 0.4,
            ),
          ),
        ),
      ],
    );
  }
}

/// Franja lima corporativa.
///
/// Es el rasgo distintivo de la marca: barra de acento pegada al borde superior,
/// respetando el *safe area* (notch / isla dinámica en iOS).
class GhTopStripe extends StatelessWidget {
  const GhTopStripe({
    super.key,
    this.includeSafeArea = true,
    this.height = GhTokens.topStripeHeight,
    this.color = GhTokens.accent,
  });

  final bool includeSafeArea;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final topPadding = includeSafeArea ? MediaQuery.paddingOf(context).top : 0.0;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        if (topPadding > 0)
          Container(height: topPadding, color: color),
        Semantics(
          label: 'Franja corporativa',
          child: Container(height: height, color: color),
        ),
      ],
    );
  }
}

/// Envuelve cualquier pantalla añadiendo la franja lima superior.
class GhStripedScaffold extends StatelessWidget {
  const GhStripedScaffold({
    super.key,
    required this.child,
    this.backgroundColor,
  });

  final Widget child;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: backgroundColor ?? Theme.of(context).colorScheme.surface,
      child: Column(
        children: <Widget>[
          const GhTopStripe(),
          Expanded(child: child),
        ],
      ),
    );
  }
}
