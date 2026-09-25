import 'package:flutter/material.dart';

import '../theme/gh_tokens.dart';
import 'gh_branding.dart';

/// Estado vacío ilustrado con acción opcional.
class GhEmptyState extends StatelessWidget {
  const GhEmptyState({
    super.key,
    required this.title,
    required this.message,
    this.illustration = GhIllustration.empty,
    this.actionLabel,
    this.onAction,
    this.icon,
  });

  final String title;
  final String message;
  final GhIllustration illustration;
  final String? actionLabel;
  final VoidCallback? onAction;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  if (icon != null)
                    Container(
                      width: 88,
                      height: 88,
                      decoration: BoxDecoration(
                        color: GhTokens.primary50,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(icon, size: 42, color: GhTokens.primary),
                    )
                  else
                    GhIllustrationView(illustration: illustration, size: 160),
                  const SizedBox(height: 20),
                  Semantics(
                    header: true,
                    child: Text(
                      title,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleLarge,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  if (actionLabel != null && onAction != null) ...<Widget>[
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: onAction,
                      icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                      label: Text(actionLabel!),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Error de red con reintento (mensaje claro + acción).
class GhErrorState extends StatelessWidget {
  const GhErrorState({
    super.key,
    required this.message,
    this.onRetry,
    this.title = 'No pudimos cargar la información',
    this.isRetrying = false,
  });

  final String message;
  final VoidCallback? onRetry;
  final String title;
  final bool isRetrying;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Container(
                    width: 84,
                    height: 84,
                    decoration: BoxDecoration(
                      color: GhTokens.danger.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.wifi_off_rounded,
                      size: 40,
                      color: GhTokens.danger,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 24),
                  if (onRetry != null)
                    FilledButton.icon(
                      onPressed: isRetrying ? null : onRetry,
                      icon: isRetrying
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.refresh_rounded, size: 18),
                      label: Text(isRetrying ? 'Reintentando…' : 'Reintentar'),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Pie de lista para scroll infinito.
class GhLoadMoreFooter extends StatelessWidget {
  const GhLoadMoreFooter({
    super.key,
    required this.isLoading,
    required this.hasMore,
    this.endLabel = 'No hay más resultados',
  });

  final bool isLoading;
  final bool hasMore;
  final String endLabel;

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2.4),
          ),
        ),
      );
    }
    if (!hasMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: Text(
            endLabel,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }
    return const SizedBox(height: 24);
  }
}
