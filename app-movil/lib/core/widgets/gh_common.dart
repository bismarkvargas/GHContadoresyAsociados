import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/gh_tokens.dart';
import '../utils/formatters.dart';
import '../utils/status_labels.dart';
import 'gh_skeleton.dart';

/// Encabezado de sección con acción opcional.
class GhSectionHeader extends StatelessWidget {
  const GhSectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.padding = const EdgeInsets.fromLTRB(16, 24, 16, 12),
  });

  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Semantics(
                  header: true,
                  child: Text(title, style: theme.textTheme.titleLarge),
                ),
                if (subtitle != null) ...<Widget>[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          if (actionLabel != null && onAction != null)
            TextButton(
              onPressed: onAction,
              child: Text(actionLabel!),
            ),
        ],
      ),
    );
  }
}

/// Etiqueta de estado con color semántico (docs/03 §7).
class GhStatusBadge extends StatelessWidget {
  const GhStatusBadge({
    super.key,
    required this.status,
    this.label,
    this.compact = false,
    this.icon,
  });

  final String status;
  final String? label;
  final bool compact;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final color = GhStatus.color(status);
    return Semantics(
      label: 'Estado: ${label ?? GhStatus.label(status)}',
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 8 : 10,
          vertical: compact ? 3 : 5,
        ),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(compact ? 8 : 10),
          border: Border.all(color: color.withValues(alpha: 0.28)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (icon != null) ...<Widget>[
              Icon(icon, size: compact ? 12 : 14, color: color),
              const SizedBox(width: 4),
            ],
            Text(
              label ?? GhStatus.label(status),
              style: TextStyle(
                color: color,
                fontSize: compact ? 11 : 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Chip de prioridad.
class GhPriorityBadge extends StatelessWidget {
  const GhPriorityBadge({super.key, required this.priority});

  final String priority;

  @override
  Widget build(BuildContext context) {
    final color = GhStatus.color(priority);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        GhStatus.label(priority),
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// Precio en USD con equivalencia opcional en colones.
class GhPriceTag extends StatelessWidget {
  const GhPriceTag({
    super.key,
    required this.amount,
    this.currency = 'USD',
    this.showCrc = false,
    this.size = 18,
  });

  final num amount;
  final String currency;
  final bool showCrc;
  final double size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(
          GhFormat.money(amount, currency: currency),
          style: TextStyle(
            fontSize: size,
            fontWeight: FontWeight.w700,
            color: GhTokens.primary,
            letterSpacing: -0.3,
          ),
        ),
        if (showCrc)
          Text(
            '≈ ${GhFormat.moneyCrc(amount)}',
            style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
          ),
      ],
    );
  }
}

/// Selector de cantidad accesible (≥ 44 px de área táctil).
class GhQuantitySelector extends StatelessWidget {
  const GhQuantitySelector({
    super.key,
    required this.quantity,
    required this.onChanged,
    this.min = 1,
    this.max = 20,
    this.compact = false,
  });

  final int quantity;
  final ValueChanged<int> onChanged;
  final int min;
  final int max;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final size = compact ? 36.0 : GhTokens.minTouchTarget;

    Widget button({
      required IconData icon,
      required String semanticsLabel,
      required VoidCallback? onTap,
    }) {
      return Semantics(
        button: true,
        label: semanticsLabel,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            width: size,
            height: size,
            child: Icon(
              icon,
              size: compact ? 18 : 20,
              color: onTap == null ? scheme.outline : scheme.onSurface,
            ),
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: scheme.outlineVariant),
        borderRadius: BorderRadius.circular(GhTokens.radiusControl),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          button(
            icon: Icons.remove_rounded,
            semanticsLabel: 'Quitar una unidad',
            onTap: quantity > min ? () => onChanged(quantity - 1) : null,
          ),
          Semantics(
            label: 'Cantidad $quantity',
            child: Container(
              constraints: BoxConstraints(minWidth: compact ? 28 : 36),
              alignment: Alignment.center,
              child: Text(
                '$quantity',
                style: TextStyle(
                  fontSize: compact ? 14 : 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          button(
            icon: Icons.add_rounded,
            semanticsLabel: 'Añadir una unidad',
            onTap: quantity < max ? () => onChanged(quantity + 1) : null,
          ),
        ],
      ),
    );
  }
}

/// Contadores del home (expedientes, tareas, documentos, mensajes).
class GhMetricCard extends StatelessWidget {
  const GhMetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.onTap,
    this.badge,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: onTap != null,
      label: '$label: $value',
      child: Material(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: GhTokens.cardRadius,
        child: InkWell(
          onTap: onTap,
          borderRadius: GhTokens.cardRadius,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: GhTokens.cardRadius,
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(icon, size: 18, color: color),
                    ),
                    const Spacer(),
                    if (badge != null && badge! > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: GhTokens.primary,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '$badge',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  value,
                  style: theme.textTheme.headlineMedium?.copyWith(height: 1.1),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  style: theme.textTheme.bodySmall,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Acceso rápido del home (ícono + etiqueta).
class GhQuickAction extends StatelessWidget {
  const GhQuickAction({
    super.key,
    required this.label,
    required this.icon,
    required this.onTap,
    this.color = GhTokens.primary,
    this.badge,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final Color color;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: GhTokens.controlRadius,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Stack(
                clipBehavior: Clip.none,
                children: <Widget>[
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(icon, color: color, size: 24),
                  ),
                  if (badge != null && badge! > 0)
                    Positioned(
                      right: -4,
                      top: -4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: GhTokens.primary,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: theme.colorScheme.surface,
                            width: 2,
                          ),
                        ),
                        child: Text(
                          badge! > 99 ? '99+' : '$badge',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: 78,
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Imagen de producto con cache, placeholder y fallback vectorial.
class GhProductImage extends StatelessWidget {
  const GhProductImage({
    super.key,
    required this.imageUrl,
    this.height = 110,
    this.width = double.infinity,
    this.borderRadius = const BorderRadius.vertical(top: Radius.circular(16)),
    this.fit = BoxFit.cover,
  });

  final String? imageUrl;
  final double height;
  final double width;
  final BorderRadius borderRadius;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      width: width,
      height: height,
      color: GhTokens.primary50,
      alignment: Alignment.center,
      child: const Icon(Icons.receipt_long_outlined, color: GhTokens.primary, size: 34),
    );

    if (imageUrl == null || imageUrl!.isEmpty) {
      return ClipRRect(borderRadius: borderRadius, child: placeholder);
    }

    return ClipRRect(
      borderRadius: borderRadius,
      child: CachedNetworkImage(
        imageUrl: imageUrl!,
        width: width,
        height: height,
        fit: fit,
        placeholder: (context, url) => const ShimmerBox(
          width: double.infinity,
          height: 110,
          radius: 0,
        ),
        errorWidget: (context, url, error) => placeholder,
      ),
    );
  }
}

/// Tarjeta base con estilo de marca.
class GhCard extends StatelessWidget {
  const GhCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.margin = EdgeInsets.zero,
    this.borderColor,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final EdgeInsets margin;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: margin,
      child: Material(
        color: scheme.surfaceContainerLowest,
        borderRadius: GhTokens.cardRadius,
        child: InkWell(
          onTap: onTap,
          borderRadius: GhTokens.cardRadius,
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: GhTokens.cardRadius,
              border: Border.all(color: borderColor ?? scheme.outlineVariant),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Aviso informativo en línea (success/warning/info/danger).
class GhInlineNotice extends StatelessWidget {
  const GhInlineNotice({
    super.key,
    required this.message,
    this.color = GhTokens.info,
    this.icon = Icons.info_outline_rounded,
    this.title,
    this.action,
  });

  final String message;
  final Color color;
  final IconData icon;
  final String? title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: GhTokens.controlRadius,
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (title != null) ...<Widget>[
                  Text(
                    title!,
                    style: theme.textTheme.labelLarge?.copyWith(color: color),
                  ),
                  const SizedBox(height: 2),
                ],
                Text(
                  message,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface,
                  ),
                ),
                if (action != null) ...<Widget>[
                  const SizedBox(height: 8),
                  action!,
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Barra de progreso de un expediente con porcentaje.
class GhProgressBar extends StatelessWidget {
  const GhProgressBar({
    super.key,
    required this.progress,
    this.showLabel = true,
    this.color,
    this.height = 8,
  });

  /// Valor entre 0 y 1.
  final double progress;
  final bool showLabel;
  final Color? color;
  final double height;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final value = progress.clamp(0.0, 1.0);
    final barColor = color ??
        (value >= 0.99
            ? GhTokens.success
            : value >= 0.5
                ? GhTokens.primary
                : GhTokens.warning);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (showLabel) ...<Widget>[
          Row(
            children: <Widget>[
              Text(
                'Avance',
                style: theme.textTheme.bodySmall,
              ),
              const Spacer(),
              Text(
                '${(value * 100).round()}%',
                style: theme.textTheme.labelMedium?.copyWith(color: barColor),
              ),
            ],
          ),
          const SizedBox(height: 6),
        ],
        Semantics(
          label: 'Avance del expediente ${(value * 100).round()} por ciento',
          child: ClipRRect(
            borderRadius: BorderRadius.circular(height / 2),
            child: LinearProgressIndicator(
              value: value,
              minHeight: height,
              backgroundColor: theme.colorScheme.surfaceContainerHighest,
              valueColor: AlwaysStoppedAnimation<Color>(barColor),
            ),
          ),
        ),
      ],
    );
  }
}

/// Aviso de modo demo (ribbon usado en el perfil y la ficha de servicio).
class GhDemoChip extends StatelessWidget {
  const GhDemoChip({super.key, this.label = 'Modo demo'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: GhTokens.warning.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: GhTokens.warning.withValues(alpha: 0.32)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Icon(Icons.science_outlined, size: 12, color: GhTokens.warning),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: GhTokens.warning,
            ),
          ),
        ],
      ),
    );
  }
}
