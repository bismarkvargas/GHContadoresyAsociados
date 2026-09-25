import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/order.dart';
import '../../core/providers/cart_provider.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';

/// Mis compras: historial de órdenes con estado y detalle del pago.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  String _status = 'all';

  static const List<({String value, String label})> _filters =
      <({String value, String label})>[
    (value: 'all', label: 'Todas'),
    (value: 'PendingPayment', label: 'Por pagar'),
    (value: 'Paid', label: 'Pagadas'),
    (value: 'InProcess', label: 'En proceso'),
    (value: 'Completed', label: 'Completadas'),
    (value: 'Refunded', label: 'Reembolsadas'),
  ];

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(ordersByStatusProvider(_status));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis compras'),
        actions: <Widget>[
          IconButton(
            onPressed: () => ref.invalidate(ordersByStatusProvider(_status)),
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Actualizar',
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: <Widget>[
                for (final filter in _filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(filter.label),
                      selected: _status == filter.value,
                      onSelected: (_) => setState(() => _status = filter.value),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(ordersByStatusProvider(_status));
                await ref.read(ordersByStatusProvider(_status).future);
              },
              child: orders.when(
                loading: () => const ListSkeleton(count: 3, lines: 2),
                error: (error, _) => GhErrorState(
                  message: 'No pudimos cargar tus compras.',
                  onRetry: () => ref.invalidate(ordersByStatusProvider(_status)),
                ),
                data: (list) {
                  if (list.isEmpty) {
                    return GhEmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: 'Sin compras en esta vista',
                      message:
                          'Contrata un servicio del catálogo y verás aquí el '
                          'historial de pagos y expedientes generados.',
                      actionLabel: 'Ver servicios',
                      onAction: () => context.go(AppRoutes.services),
                    );
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: list.length,
                    itemBuilder: (context, index) => _OrderCard(
                      order: list[index],
                      onTap: () =>
                          context.push(AppRoutes.orderDetail(list[index].id)),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.onTap});

  final Order order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GhCard(
      margin: const EdgeInsets.only(bottom: 12),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      order.number,
                      style: theme.textTheme.labelMedium?.copyWith(
                        letterSpacing: 0.4,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      GhFormat.dateTime(order.createdAt),
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              GhStatusBadge(status: order.status),
            ],
          ),
          const SizedBox(height: 12),
          for (final item in order.items.take(2))
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      '${item.quantity} × ${item.nameSnapshot}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                  Text(
                    GhFormat.money(item.total),
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          if (order.items.length > 2)
            Text(
              '+ ${order.items.length - 2} servicio(s) más',
              style: theme.textTheme.bodySmall,
            ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(),
          ),
          Row(
            children: <Widget>[
              GhPriceTag(amount: order.totals.total, size: 17),
              const Spacer(),
              if (order.payment != null)
                Row(
                  children: <Widget>[
                    Icon(
                      order.payment!.method == PaymentMethod.card
                          ? Icons.credit_card_rounded
                          : order.payment!.method == PaymentMethod.sinpe
                              ? Icons.phone_iphone_rounded
                              : Icons.account_balance_outlined,
                      size: 14,
                      color: GhTokens.muted,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      paymentMethodLabel(order.payment!.method),
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              if (order.caseCodes.isNotEmpty) ...<Widget>[
                const SizedBox(width: 10),
                const Icon(Icons.folder_open_rounded, size: 14, color: GhTokens.muted),
                const SizedBox(width: 4),
                Text(
                  order.caseCodes.first,
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                ),
              ],
            ],
          ),
          if (order.isPayable) ...<Widget>[
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: () => context.go(AppRoutes.cart),
              icon: const Icon(Icons.payment_rounded, size: 17),
              label: const Text('Completar pago'),
            ),
          ],
        ],
      ),
    );
  }
}
