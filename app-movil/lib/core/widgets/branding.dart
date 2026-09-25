import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/gh_tokens.dart';

/// Isotipo de marca GH: monograma dibujado con vectores (sin assets externos).
class GhLogo extends StatelessWidget {
  const GhLogo({
    super.key,
    this.size = 48,
    this.showWordmark = false,
    this.onDark = false,
  });

  final double size;
  final bool showWordmark;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final mark = _GhMark(size: size);
    if (!showWordmark) return mark;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        mark,
        const SizedBox(width: 12),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              'GH Contadores',
              style: TextStyle(
                fontSize: size * 0.36,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.3,
                color: onDark ? Colors.white : GhTokens.ink,
              ),
            ),
            Text(
              '& Asociados',
              style: TextStyle(
                fontSize: size * 0.24,
                fontWeight: FontWeight.w500,
                letterSpacing: 2.4,
                color: onDark ? Colors.white70 : GhTokens.muted,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _GhMark extends StatelessWidget {
  const _GhMark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'GH Contadores y Asociados',
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[GhTokens.primary, GhTokens.primary600],
          ),
          borderRadius: BorderRadius.circular(size * 0.28),
        ),
        alignment: Alignment.center,
        child: CustomPaint(
          size: Size(size * 0.62, size * 0.62),
          painter: _GhMonogramPainter(
            color: Colors.white,
            strokeWidth: size * 0.075,
          ),
        ),
      ),
    );
  }
}

/// Dibuja "GH" con trazos geométricos (G circular + H de barras).
class _GhMonogramPainter extends CustomPainter {
  const _GhMonogramPainter({required this.color, required this.strokeWidth});

  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final w = size.width;
    final h = size.height;

    // Letra "G".
    canvas.drawArc(
      Rect.fromLTRB(0, 0, w * 0.46, h),
      math.pi * 0.28,
      math.pi * 1.62,
      false,
      paint,
    );
    canvas.drawLine(Offset(w * 0.24, h * 0.52), Offset(w * 0.46, h * 0.52), paint);
    canvas.drawLine(Offset(w * 0.46, h * 0.52), Offset(w * 0.46, h * 0.34), paint);

    // Letra "H".
    final hLeft = w * 0.62;
    final hRight = w * 0.98;
    canvas.drawLine(Offset(hLeft, 0), Offset(hLeft, h), paint);
    canvas.drawLine(Offset(hRight, 0), Offset(hRight, h), paint);
    canvas.drawLine(Offset(hLeft, h * 0.5), Offset(hRight, h * 0.5), paint);
  }

  @override
  bool shouldRepaint(covariant _GhMonogramPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.strokeWidth != strokeWidth;
}

/// Ilustración vectorial para onboarding, estados vacíos y errores.
enum GhIllustration { accounting, legal, municipal, tax, empty, success, search }

class GhIllustrationView extends StatelessWidget {
  const GhIllustrationView({
    super.key,
    required this.illustration,
    this.size = 180,
  });

  final GhIllustration illustration;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _IllustrationPainter(
          illustration: illustration,
          primary: GhTokens.primary,
          accent: scheme.onSurface,
          soft: Theme.of(context).brightness == Brightness.dark
              ? GhTokens.darkSurface2
              : GhTokens.primary50,
          surface: scheme.surfaceContainerLowest,
          border: scheme.outlineVariant,
        ),
      ),
    );
  }
}

class _IllustrationPainter extends CustomPainter {
  const _IllustrationPainter({
    required this.illustration,
    required this.primary,
    required this.accent,
    required this.soft,
    required this.surface,
    required this.border,
  });

  final GhIllustration illustration;
  final Color primary;
  final Color accent;
  final Color soft;
  final Color surface;
  final Color border;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;

    final softPaint = Paint()..color = soft;
    final cardPaint = Paint()..color = surface;
    final linePaint = Paint()
      ..color = border
      ..strokeWidth = w * 0.012
      ..style = PaintingStyle.stroke;
    final primaryPaint = Paint()..color = primary;
    final accentPaint = Paint()..color = accent.withValues(alpha: 0.75);

    // Base: círculo suave de fondo.
    canvas.drawCircle(Offset(w / 2, size.height / 2), w * 0.46, softPaint);

    switch (illustration) {
      case GhIllustration.accounting:
        _drawDocument(
          canvas,
          size,
          cardPaint,
          linePaint,
          primaryPaint,
          accentPaint,
          bars: true,
        );
        break;
      case GhIllustration.legal:
        _drawScales(canvas, size, accentPaint);
        break;
      case GhIllustration.municipal:
        _drawBuilding(canvas, size, cardPaint, primaryPaint, accentPaint);
        break;
      case GhIllustration.tax:
        _drawDocument(
          canvas,
          size,
          cardPaint,
          linePaint,
          primaryPaint,
          accentPaint,
          bars: false,
        );
        break;
      case GhIllustration.empty:
        _drawEmptyBox(canvas, size, cardPaint, linePaint, primaryPaint);
        break;
      case GhIllustration.success:
        _drawCheck(canvas, size);
        break;
      case GhIllustration.search:
        _drawSearch(canvas, size, accentPaint);
        break;
    }
  }

  void _drawDocument(
    Canvas canvas,
    Size size,
    Paint cardPaint,
    Paint linePaint,
    Paint primaryPaint,
    Paint accentPaint, {
    required bool bars,
  }) {
    final w = size.width;
    final h = size.height;
    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH(w * 0.24, h * 0.18, w * 0.52, h * 0.64),
      Radius.circular(w * 0.05),
    );
    canvas.drawRRect(rect, cardPaint);
    canvas.drawRRect(rect, linePaint);

    // Encabezado de marca.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(w * 0.32, h * 0.26, w * 0.2, h * 0.05),
        Radius.circular(w * 0.02),
      ),
      primaryPaint,
    );

    if (bars) {
      for (int i = 0; i < 3; i++) {
        final barH = h * (0.14 - i * 0.03);
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(w * (0.34 + i * 0.12), h * 0.68 - barH, w * 0.08, barH),
            Radius.circular(w * 0.02),
          ),
          i == 2 ? primaryPaint : accentPaint,
        );
      }
    } else {
      for (int i = 0; i < 3; i++) {
        canvas.drawLine(
          Offset(w * 0.34, h * (0.42 + i * 0.1)),
          Offset(w * 0.66, h * (0.42 + i * 0.1)),
          linePaint,
        );
      }
    }
  }

  void _drawScales(Canvas canvas, Size size, Paint accentPaint) {
    final w = size.width;
    final h = size.height;
    final bar = Paint()
      ..color = primary
      ..strokeWidth = w * 0.03
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(Offset(w * 0.5, h * 0.22), Offset(w * 0.5, h * 0.74), bar);
    canvas.drawLine(Offset(w * 0.32, h * 0.3), Offset(w * 0.68, h * 0.3), bar);
    canvas.drawLine(Offset(w * 0.36, h * 0.78), Offset(w * 0.64, h * 0.78), bar);

    final leftPan = Path()
      ..moveTo(w * 0.24, h * 0.5)
      ..lineTo(w * 0.4, h * 0.5)
      ..lineTo(w * 0.32, h * 0.62)
      ..close();
    canvas.drawPath(leftPan, accentPaint);

    final rightPan = Path()
      ..moveTo(w * 0.6, h * 0.5)
      ..lineTo(w * 0.76, h * 0.5)
      ..lineTo(w * 0.68, h * 0.62)
      ..close();
    canvas.drawPath(rightPan, accentPaint);
  }

  void _drawBuilding(
    Canvas canvas,
    Size size,
    Paint cardPaint,
    Paint primaryPaint,
    Paint accentPaint,
  ) {
    final w = size.width;
    final h = size.height;
    final base = RRect.fromRectAndRadius(
      Rect.fromLTWH(w * 0.28, h * 0.36, w * 0.44, h * 0.42),
      Radius.circular(w * 0.04),
    );
    canvas.drawRRect(base, cardPaint);
    canvas.drawRRect(
      base,
      Paint()
        ..color = primary
        ..style = PaintingStyle.stroke
        ..strokeWidth = w * 0.02,
    );

    final roof = Path()
      ..moveTo(w * 0.24, h * 0.38)
      ..lineTo(w * 0.5, h * 0.2)
      ..lineTo(w * 0.76, h * 0.38)
      ..close();
    canvas.drawPath(roof, primaryPaint);

    for (int r = 0; r < 2; r++) {
      for (int c = 0; c < 3; c++) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(
              w * (0.35 + c * 0.11),
              h * (0.45 + r * 0.14),
              w * 0.06,
              h * 0.07,
            ),
            Radius.circular(w * 0.015),
          ),
          accentPaint,
        );
      }
    }
  }

  void _drawEmptyBox(
    Canvas canvas,
    Size size,
    Paint cardPaint,
    Paint linePaint,
    Paint primaryPaint,
  ) {
    final w = size.width;
    final h = size.height;
    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH(w * 0.26, h * 0.34, w * 0.48, h * 0.36),
      Radius.circular(w * 0.06),
    );
    canvas.drawRRect(rect, cardPaint);
    canvas.drawRRect(rect, linePaint);
    canvas.drawLine(Offset(w * 0.26, h * 0.34), Offset(w * 0.5, h * 0.5), linePaint);
    canvas.drawLine(Offset(w * 0.74, h * 0.34), Offset(w * 0.5, h * 0.5), linePaint);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(w * 0.42, h * 0.22, w * 0.16, h * 0.06),
        Radius.circular(w * 0.02),
      ),
      primaryPaint,
    );
  }

  void _drawCheck(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    canvas.drawCircle(
      Offset(w / 2, h / 2),
      w * 0.3,
      Paint()
        ..color = primary
        ..style = PaintingStyle.stroke
        ..strokeWidth = w * 0.06,
    );
    final path = Path()
      ..moveTo(w * 0.36, h * 0.52)
      ..lineTo(w * 0.46, h * 0.63)
      ..lineTo(w * 0.66, h * 0.4);
    canvas.drawPath(
      path,
      Paint()
        ..color = primary
        ..style = PaintingStyle.stroke
        ..strokeWidth = w * 0.07
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  void _drawSearch(Canvas canvas, Size size, Paint accentPaint) {
    final w = size.width;
    final h = size.height;
    canvas.drawCircle(
      Offset(w * 0.46, h * 0.44),
      w * 0.2,
      Paint()
        ..color = primary
        ..style = PaintingStyle.stroke
        ..strokeWidth = w * 0.055,
    );
    canvas.drawLine(
      Offset(w * 0.6, h * 0.6),
      Offset(w * 0.74, h * 0.74),
      Paint()
        ..color = primary
        ..strokeWidth = w * 0.06
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawCircle(Offset(w * 0.46, h * 0.44), w * 0.1, accentPaint);
  }

  @override
  bool shouldRepaint(covariant _IllustrationPainter oldDelegate) =>
      oldDelegate.illustration != illustration ||
      oldDelegate.primary != primary ||
      oldDelegate.accent != accent ||
      oldDelegate.soft != soft ||
      oldDelegate.surface != surface;
}

/// Marca de agua decorativa con el monograma (para cabeceras).
class GhWatermark extends StatelessWidget {
  const GhWatermark({super.key, required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: 0.12,
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _GhMonogramPainter(
            color: GhTokens.primary,
            strokeWidth: size * 0.06,
          ),
        ),
      ),
    );
  }
}
