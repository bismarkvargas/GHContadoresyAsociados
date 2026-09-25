import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../core/models/cart.dart';
import '../../core/providers/cart_provider.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';

/// Carrito: edición de cantidades, subtotal / IVA / total y paso al checkout.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(cartProvider);
    final cart = state.cart;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Carrito'),
        actions: <Widget>[
          if (!cart.isEmpty)
            TextButton(
              onPressed: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Vaciar carrito'),
                    content: const Text(
                      'Se quitarán todos los servicios de tu carrito. ¿Continuar?',
                    ),
                    actions: <Widget>[
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(false),
                        child: const Text('Cancelar'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.of(context).pop(true),
                        child: const Text('Vaciar'),
                      ),
                    ],
                  ),
                );
                if (confirmed == true) {
                  await ref.read(cartProvider.notifier).clear();
                }
              },
              child: const Text('Vaciar'),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(cartProvider.notifier).load(),
        child: state.isLoading && cart.isEmpty
            ? const _CartSkeleton()
            : cart.isEmpty
                ? GhEmptyState(
                    icon: Icons.shopping_cart_outlined,
                    title: 'Tu carrito está vacío',
                    message:
                        'Explora el catálogo de servicios contables, legales, '
                        'municipales y tributarios y agrega los que necesites.',
                    actionLabel: 'Ver servicios',
                    onAction: () => context.go(AppRoutes.services),
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    children: <Widget>[
                      if (AppConfig.useMocks)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 12),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: GhDemoChip(label: 'Checkout simulado'),
                          ),
                        ),
                      for (final item in cart.items)
                        _CartItemTile(
                          item: item,
                          isBusy: state.isMutating,
                          onQuantityChanged: (value) => ref
                              .read(cartProvider.notifier)
                              .updateQuantity(item.id, value),
                          onRemove: () =>
                              ref.read(cartProvider.notifier).remove(item.id),
                        ),
                      const SizedBox(height: 8),
                      _TotalsCard(totals: cart.totals),
                      const SizedBox(height: 16),
                      GhInlineNotice(
                        message:
                            'Los precios están en USD e incluyen el IVA de Costa Rica '
                            '(13 %). El tipo de cambio usado es referencial: '
                            '₡${AppConfig.usdToCrc.toStringAsFixed(0)} por dólar.',
                        color: GhTokens.info,
                        icon: Icons.info_outline_rounded,
                      ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        key: const Key('cart-continue-to-checkout'),
                        onPressed: () => context.push(AppRoutes.checkout),
                        icon: const Icon(Icons.lock_outline_rounded, size: 18),
                        label: Text(
                          'Continuar al pago · ${GhFormat.money(cart.totals.total)}',
                        ),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: () => context.go(AppRoutes.services),
                        child: const Text('Seguir comprando'),
                      ),
                    ],
                  ),
      ),
    );
  }
}

class _CartItemTile extends StatelessWidget {
  const _CartItemTile({
    required this.item,
    required this.isBusy,
    required this.onQuantityChanged,
    required this.onRemove,
  });

  final CartItem item;
  final bool isBusy;
  final ValueChanged<int> onQuantityChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GhCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          GhProductImage(
            imageUrl: item.product.imageUrl,
            width: 62,
            height: 62,
            borderRadius: GhTokens.controlRadius,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  item.product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(fontSize: 14),
                ),
                const SizedBox(height: 2),
                Text(
                  item.product.categoryName,
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                ),
                const SizedBox(height: 8),
                Row(
                  children: <Widget>[
                    GhQuantitySelector(
                      quantity: item.quantity,
                      compact: true,
                      onChanged: isBusy ? (_) {} : onQuantityChanged,
                    ),
                    const Spacer(),
                    Text(
                      GhFormat.money(item.lineTotal),
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: GhTokens.primary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: isBusy ? null : onRemove,
                    icon: const Icon(Icons.delete_outline_rounded, size: 16),
                    label: const Text('Quitar'),
                    style: TextButton.styleFrom(
                      foregroundColor: GhTokens.danger,
                      minimumSize: const Size(0, 36),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TotalsCard extends StatelessWidget {
  const _TotalsCard({required this.totals});

  final CartTotals totals;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GhCard(
      child: Column(
        children: <Widget>[
          _row(theme, 'Subtotal', GhFormat.money(totals.subtotal)),
          const SizedBox(height: 8),
          _row(theme, 'Descuento', '- ${GhFormat.money(totals.discount)}'),
          const SizedBox(height: 8),
          _row(theme, 'IVA (13 %)', GhFormat.money(totals.tax)),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Divider(),
          ),
          Row(
            children: <Widget>[
              Text('Total a pagar', style: theme.textTheme.titleMedium),
              const Spacer(),
              GhPriceTag(amount: totals.total, size: 22, showCrc: true),
            ],
          ),
        ],
      ),
    );
  }

  Widget _row(ThemeData theme, String label, String value) {
    return Row(
      children: <Widget>[
        Text(label, style: theme.textTheme.bodyMedium),
        const Spacer(),
        Text(value, style: theme.textTheme.bodyMedium),
      ],
    );
  }
}

class _CartSkeleton extends StatelessWidget {
  const _CartSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const <Widget>[
        ListTileSkeleton(lines: 2),
        ListTileSkeleton(lines: 2),
        ListTileSkeleton(lines: 1),
      ],
    );
  }
}
