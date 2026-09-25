import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/case_file.dart';
import '../models/catalog.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';
import '../providers/guest_provider.dart';
import '../router/app_router.dart';
import '../theme/gh_tokens.dart';
import '../utils/formatters.dart';
import '../utils/status_labels.dart';
import 'gh_common.dart';
import 'gh_guest.dart';

/// Acción de carrito consciente de la sesión.
///
/// Sin sesión no falla en silencio ni muestra un error técnico: guarda el
/// producto pendiente y abre la hoja «Inicie sesión para agregar servicios a su
/// carrito». Tras el login, `AuthNotifier` recupera ese producto y lo agrega
/// automáticamente.
Future<void> addToCartGuarded(
  BuildContext context,
  WidgetRef ref,
  Product product, {
  int quantity = 1,
}) async {
  final isLoggedIn = ref.read(authProvider).isAuthenticated;

  if (!isLoggedIn) {
    ref.read(pendingCartProductProvider.notifier).state = product;
    if (!context.mounted) return;
    await showGuestSheet(
      context,
      ref,
      intent: GuestIntent.addToCart,
      action: PendingGuestAction(
        intent: GuestIntent.addToCart,
        productId: product.id,
      ),
    );
    return;
  }

  final ok = await ref.read(cartProvider.notifier).add(product, quantity: quantity);
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? '${product.name} agregado al carrito'
              : ref.read(cartProvider).error ??
                  'No pudimos agregarlo. Intente de nuevo.',
        ),
        action: ok
            ? SnackBarAction(
                label: 'Ver carrito',
                textColor: Colors.white,
                onPressed: () => context.go(AppRoutes.cart),
              )
            : null,
      ),
    );
}

/// Tarjeta de servicio del catálogo con transición hero.
class ProductCard extends ConsumerWidget {
  const ProductCard({
    super.key,
    required this.product,
    this.showAddButton = true,
    this.onTap,
  });

  final Product product;
  final bool showAddButton;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final inCart = ref.watch(cartProvider).cart.contains(product.id);
    final isLoggedIn = ref.watch(authProvider).isAuthenticated;

    return Semantics(
      button: true,
      label: '${product.name}, ${GhFormat.money(product.price)}',
      child: Material(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: GhTokens.cardRadius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap ?? () => context.push('/service/${product.slug}'),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: GhTokens.cardRadius,
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Hero(
                  tag: 'product-image-${product.slug}',
                  child: GhProductImage(
                    imageUrl: product.imageUrl,
                    height: 104,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: GhTokens.primary50,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              product.categoryName.split(' ').last.toUpperCase(),
                              style: const TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                color: GhTokens.primary600,
                                letterSpacing: 0.4,
                              ),
                            ),
                          ),
                          if (product.isFeatured) ...<Widget>[
                            const SizedBox(width: 4),
                            const Icon(
                              Icons.star_rounded,
                              size: 14,
                              color: GhTokens.warning,
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        product.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontSize: 14,
                          height: 1.25,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: <Widget>[
                          const Icon(
                            Icons.schedule_rounded,
                            size: 12,
                            color: GhTokens.muted,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              product.estimatedLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: <Widget>[
                          Expanded(
                            child: GhPriceTag(amount: product.price, size: 16),
                          ),
                          if (showAddButton)
                            Semantics(
                              button: true,
                              label: !isLoggedIn
                                  ? 'Inicie sesión para agregar ${product.name} al carrito'
                                  : 'Agregar ${product.name} al carrito',
                              child: InkResponse(
                                key: const Key('product-add-to-cart'),
                                onTap: () => addToCartGuarded(context, ref, product),
                                radius: 24,
                                child: Container(
                                  width: 34,
                                  height: 34,
                                  decoration: BoxDecoration(
                                    color: (!isLoggedIn || !inCart)
                                        ? GhTokens.primary
                                        : GhTokens.success.withValues(alpha: 0.14),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(
                                    !isLoggedIn
                                        ? Icons.lock_outline_rounded
                                        : inCart
                                            ? Icons.check_rounded
                                            : Icons.add_shopping_cart_rounded,
                                    size: 17,
                                    color: (!isLoggedIn || !inCart)
                                        ? Colors.white
                                        : GhTokens.success,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Tarjeta de expediente en el listado.
class CaseCard extends StatelessWidget {
  const CaseCard({super.key, required this.caseFile, this.onTap});

  final CaseFile caseFile;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final matterIcon =
        GhStatus.matterIcons[caseFile.matter] ?? Icons.folder_outlined;

    return GhCard(
      margin: const EdgeInsets.only(bottom: 12),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: GhTokens.primary50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(matterIcon, size: 19, color: GhTokens.primary),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      caseFile.code,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        letterSpacing: 0.3,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${caseFile.matter} · ${caseFile.entity}',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              GhStatusBadge(status: caseFile.status, compact: true),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            caseFile.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          GhProgressBar(progress: caseFile.progress),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Icon(
                caseFile.isOverdue
                    ? Icons.warning_amber_rounded
                    : Icons.event_available_outlined,
                size: 14,
                color: caseFile.isOverdue ? GhTokens.danger : GhTokens.muted,
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  GhFormat.dueLabel(caseFile.dueAt),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: caseFile.isOverdue ? GhTokens.danger : null,
                    fontWeight: caseFile.isOverdue ? FontWeight.w600 : null,
                  ),
                ),
              ),
              if (caseFile.unreadMessages > 0) ...<Widget>[
                const Icon(Icons.forum_outlined, size: 14, color: GhTokens.info),
                const SizedBox(width: 3),
                Text(
                  '${caseFile.unreadMessages}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: GhTokens.info,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Icon(Icons.description_outlined, size: 14, color: GhTokens.muted),
              const SizedBox(width: 3),
              Text('${caseFile.documentsCount}', style: theme.textTheme.bodySmall),
              const SizedBox(width: 10),
              Icon(Icons.checklist_rounded, size: 14, color: GhTokens.muted),
              const SizedBox(width: 3),
              Text(
                '${caseFile.tasksDone}/${caseFile.tasksTotal}',
                style: theme.textTheme.bodySmall,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Fila compacta de tarea con acción de completar.
class TaskTile extends StatelessWidget {
  const TaskTile({
    super.key,
    required this.title,
    required this.status,
    this.subtitle,
    this.dueAt,
    this.priority,
    this.onComplete,
    this.isCompleting = false,
    this.showCaseCode,
  });

  final String title;
  final String status;
  final String? subtitle;
  final DateTime? dueAt;
  final String? priority;
  final VoidCallback? onComplete;
  final bool isCompleting;
  final String? showCaseCode;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDone = status == 'Done';
    final days = GhFormat.daysUntil(dueAt);
    final isOverdue = !isDone && days != null && days < 0;
    final isSoon = !isDone && days != null && days >= 0 && days <= 2;

    return GhCard(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: onComplete,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            label: isDone
                ? 'Tarea completada'
                : 'Marcar «$title» como completada',
            button: !isDone && onComplete != null,
            child: InkResponse(
              onTap: isDone || isCompleting ? null : onComplete,
              radius: 22,
              child: Container(
                width: 26,
                height: 26,
                margin: const EdgeInsets.only(top: 2),
                decoration: BoxDecoration(
                  color: isDone ? GhTokens.success : Colors.transparent,
                  border: Border.all(
                    color: isDone
                        ? GhTokens.success
                        : theme.colorScheme.outlineVariant,
                    width: 2,
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: isCompleting
                    ? const Padding(
                        padding: EdgeInsets.all(5),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : isDone
                        ? const Icon(Icons.check_rounded,
                            size: 16, color: Colors.white)
                        : null,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontSize: 14,
                    decoration: isDone ? TextDecoration.lineThrough : null,
                    color: isDone ? theme.colorScheme.onSurfaceVariant : null,
                  ),
                ),
                if (subtitle != null) ...<Widget>[
                  const SizedBox(height: 4),
                  Text(subtitle!, style: theme.textTheme.bodySmall),
                ],
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: <Widget>[
                    GhStatusBadge(status: status, compact: true),
                    if (priority != null && priority != 'Normal')
                      GhPriorityBadge(priority: priority!),
                    if (dueAt != null)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Icon(
                            Icons.schedule_rounded,
                            size: 12,
                            color: isOverdue
                                ? GhTokens.danger
                                : isSoon
                                    ? GhTokens.warning
                                    : GhTokens.muted,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            GhFormat.dueLabel(dueAt),
                            style: theme.textTheme.bodySmall?.copyWith(
                              fontSize: 11,
                              color: isOverdue
                                  ? GhTokens.danger
                                  : isSoon
                                      ? GhTokens.warning
                                      : null,
                              fontWeight: isOverdue || isSoon
                                  ? FontWeight.w600
                                  : null,
                            ),
                          ),
                        ],
                      ),
                    if (showCaseCode != null)
                      Text(
                        showCaseCode!,
                        style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
