import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../theme/gh_tokens.dart';

/// Caja con efecto shimmer (skeletons de carga).
class ShimmerBox extends StatelessWidget {
  const ShimmerBox({
    super.key,
    required this.width,
    required this.height,
    this.radius = 10,
  });

  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Shimmer.fromColors(
      baseColor: isDark ? const Color(0xFF2A2F36) : const Color(0xFFE9ECF0),
      highlightColor: isDark ? const Color(0xFF3A4149) : const Color(0xFFF7F8FA),
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF2A2F36) : const Color(0xFFE9ECF0),
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
    );
  }
}

/// Skeleton de la tarjeta de servicio (grilla del catálogo).
class ProductCardSkeleton extends StatelessWidget {
  const ProductCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        borderRadius: GhTokens.cardRadius,
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const ShimmerBox(width: double.infinity, height: 96, radius: 0),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const <Widget>[
                ShimmerBox(width: 70, height: 12),
                SizedBox(height: 8),
                ShimmerBox(width: double.infinity, height: 14),
                SizedBox(height: 6),
                ShimmerBox(width: 120, height: 14),
                SizedBox(height: 10),
                ShimmerBox(width: 60, height: 18),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Skeleton de la lista de expedientes.
class CaseCardSkeleton extends StatelessWidget {
  const CaseCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        borderRadius: GhTokens.cardRadius,
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const <Widget>[
          Row(
            children: <Widget>[
              ShimmerBox(width: 90, height: 14),
              Spacer(),
              ShimmerBox(width: 70, height: 22, radius: 11),
            ],
          ),
          SizedBox(height: 12),
          ShimmerBox(width: double.infinity, height: 16),
          SizedBox(height: 8),
          ShimmerBox(width: 180, height: 14),
          SizedBox(height: 14),
          ShimmerBox(width: double.infinity, height: 8, radius: 4),
        ],
      ),
    );
  }
}

/// Skeleton genérico de lista (mensajes, documentos, notificaciones).
class ListTileSkeleton extends StatelessWidget {
  const ListTileSkeleton({super.key, this.lines = 2});

  final int lines;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        borderRadius: GhTokens.cardRadius,
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const ShimmerBox(width: 40, height: 40, radius: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const ShimmerBox(width: double.infinity, height: 14),
                const SizedBox(height: 8),
                for (int i = 0; i < lines; i++) ...<Widget>[
                  ShimmerBox(width: i.isEven ? 200 : 140, height: 12),
                  const SizedBox(height: 6),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Grilla de skeletons del catálogo.
class ProductGridSkeleton extends StatelessWidget {
  const ProductGridSkeleton({super.key, this.count = 6});

  final int count;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.68,
      ),
      itemCount: count,
      itemBuilder: (_, __) => const ProductCardSkeleton(),
    );
  }
}

/// Lista de skeletons.
///
/// La lista es desplazable, así que se acota a [maxHeight] para poder usarla
/// también dentro de un `Column` (por ejemplo en una pestaña) sin que el
/// viewport quede con altura ilimitada.
class ListSkeleton extends StatelessWidget {
  const ListSkeleton({
    super.key,
    this.count = 4,
    this.lines = 2,
    this.maxHeight = 420,
  });

  final int count;
  final int lines;
  final double maxHeight;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: count,
        itemBuilder: (_, __) => ListTileSkeleton(lines: lines),
      ),
    );
  }
}

/// Barra de progreso indeterminada de marca.
class GhLoadingBar extends StatelessWidget {
  const GhLoadingBar({super.key});

  @override
  Widget build(BuildContext context) {
    return const LinearProgressIndicator(minHeight: 3);
  }
}
