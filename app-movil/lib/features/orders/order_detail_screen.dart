import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/models/order.dart';
import '../../core/providers/cart_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/status_labels.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';

/// Detalle del pedido: ítems, pago, facturación y expedientes generados.
class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderDetailProvider(orderId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalle del pedido'),
        actions: <Widget>[
          IconButton(
            onPressed: () => ref.invalidate(orderDetailProvider(orderId)),
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Actualizar',
          ),
        ],
      ),
      body: order.when(
        loading: () => const _OrderSkeleton(),
        error: (error, _) => GhErrorState(
          message: 'No pudimos cargar este pedido.',
          onRetry: () => ref.invalidate(orderDetailProvider(orderId)),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(orderDetailProvider(orderId));
            await ref.read(orderDetailProvider(orderId).future);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            physics: const AlwaysScrollableScrollPhysics(),
            children: <Widget>[
              GhCard(
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
                                data.number,
                                style: theme.textTheme.titleLarge,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Creado el ${GhFormat.dateTime(data.createdAt)}',
                                style: theme.textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        GhStatusBadge(status: data.status),
                      ],
                    ),
                    const SizedBox(height: 16),
                    GhProgressBar(
                      progress: _progressFor(data.status),
                      color: GhStatus.color(data.status),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              GhSectionHeader(
                title: 'Servicios',
                padding: const EdgeInsets.only(bottom: 8),
              ),
              GhCard(
                child: Column(
                  children: <Widget>[
                    for (final item in data.items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(
                                    item.nameSnapshot,
                                    style: theme.textTheme.bodyMedium,
                                  ),
                                  if (item.caseCode != null)
                                    Text(
                                      'Expediente ${item.caseCode}',
                                      style: theme.textTheme.bodySmall?.copyWith(
                                        fontSize: 11,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              '${item.quantity} × ${GhFormat.money(item.unitPrice)}',
                              style: theme.textTheme.bodySmall,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              GhFormat.money(item.total),
                              style: theme.textTheme.labelMedium,
                            ),
                          ],
                        ),
                      ),
                    const Divider(),
                    const SizedBox(height: 10),
                    _row(theme, 'Subtotal', GhFormat.money(data.totals.subtotal)),
                    const SizedBox(height: 6),
                    _row(theme, 'Descuento', '- ${GhFormat.money(data.totals.discount)}'),
                    const SizedBox(height: 6),
                    _row(theme, 'IVA (13 %)', GhFormat.money(data.totals.tax)),
                    const SizedBox(height: 10),
                    Row(
                      children: <Widget>[
                        Text('Total', style: theme.textTheme.titleMedium),
                        const Spacer(),
                        GhPriceTag(amount: data.totals.total, size: 20),
                      ],
                    ),
                  ],
                ),
              ),
              if (data.payment != null) ...<Widget>[
                GhSectionHeader(
                  title: 'Pago',
                  padding: const EdgeInsets.fromLTRB(0, 20, 0, 8),
                ),
                GhCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: Text(
                              paymentMethodLabel(data.payment!.method),
                              style: theme.textTheme.titleMedium,
                            ),
                          ),
                          GhStatusBadge(status: data.payment!.status),
                        ],
                      ),
                      const SizedBox(height: 14),
                      if (data.payment!.cardLast4 != null)
                        _line(
                          theme,
                          'Tarjeta',
                          GhFormat.cardMasked(
                            data.payment!.cardBrand,
                            data.payment!.cardLast4,
                          ),
                        ),
                      if (data.payment!.cardHolder != null)
                        _line(theme, 'Titular', data.payment!.cardHolder!),
                      if (data.payment!.authorizationCode != null)
                        _line(
                          theme,
                          'Autorización',
                          data.payment!.authorizationCode!,
                        ),
                      _line(theme, 'Referencia', data.payment!.reference),
                      _line(
                        theme,
                        'Procesado',
                        GhFormat.dateTime(
                          data.payment!.processedAt ?? data.payment!.createdAt,
                        ),
                      ),
                      if (data.payment!.failureReason != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: GhInlineNotice(
                            message: data.payment!.failureReason!,
                            color: GhTokens.danger,
                            icon: Icons.error_outline_rounded,
                          ),
                        ),
                      if (data.payment!.instructions != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: GhInlineNotice(
                            message: data.payment!.instructions!,
                            color: GhTokens.warning,
                            icon: Icons.info_outline_rounded,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
              if (data.invoice != null) ...<Widget>[
                GhSectionHeader(
                  title: 'Facturación',
                  padding: const EdgeInsets.fromLTRB(0, 20, 0, 8),
                ),
                GhCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      _line(theme, 'Razón social', data.invoice!.legalName),
                      _line(theme, 'Cédula / NIT', data.invoice!.idNumber),
                      _line(theme, 'Correo', data.invoice!.email),
                      if (data.invoice!.phone != null)
                        _line(theme, 'Teléfono', data.invoice!.phone!),
                      if (data.invoice!.address != null)
                        _line(theme, 'Dirección', data.invoice!.address!),
                      const SizedBox(height: 4),
                      Row(
                        children: <Widget>[
                          const Icon(Icons.receipt_outlined,
                              size: 15, color: GhTokens.muted),
                          const SizedBox(width: 6),
                          Text(
                            data.requiresInvoice
                                ? 'Factura electrónica solicitada'
                                : 'Sin factura electrónica',
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
              if (data.notes != null) ...<Widget>[
                GhSectionHeader(
                  title: 'Notas',
                  padding: const EdgeInsets.fromLTRB(0, 20, 0, 8),
                ),
                GhCard(
                  child: Text(data.notes!, style: theme.textTheme.bodyMedium),
                ),
              ],
              if (data.caseCodes.isNotEmpty) ...<Widget>[
                const SizedBox(height: 20),
                GhInlineNotice(
                  title: 'Expediente generado',
                  message:
                      'Este pedido creó ${data.caseCodes.join(", ")}. Puedes seguir '
                      'su avance en Mis expedientes.',
                  color: GhTokens.success,
                  icon: Icons.folder_shared_outlined,
                  action: FilledButton.icon(
                    onPressed: () => context.go(AppRoutes.cases),
                    icon: const Icon(Icons.folder_open_rounded, size: 17),
                    label: const Text('Ver expedientes'),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              Row(
                children: <Widget>[
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _emailReceipt(context, data),
                      icon: const Icon(Icons.mail_outline_rounded, size: 17),
                      label: const Text('Enviar recibo'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _callSupport(context),
                      icon: const Icon(Icons.phone_outlined, size: 17),
                      label: const Text('Soporte'),
                    ),
                  ),
                ],
              ),
              if (data.isPayable) ...<Widget>[
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: () => context.go(AppRoutes.cart),
                  icon: const Icon(Icons.payment_rounded, size: 18),
                  label: const Text('Completar el pago'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static double _progressFor(String status) {
    switch (status) {
      case 'PendingPayment':
        return 0.25;
      case 'Paid':
        return 0.5;
      case 'InProcess':
        return 0.75;
      case 'Completed':
        return 1;
      default:
        return 0.1;
    }
  }

  Widget _row(ThemeData theme, String label, String value) => Row(
        children: <Widget>[
          Text(label, style: theme.textTheme.bodySmall),
          const Spacer(),
          Text(value, style: theme.textTheme.bodySmall),
        ],
      );

  Widget _line(ThemeData theme, String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            SizedBox(
              width: 108,
              child: Text(label, style: theme.textTheme.bodySmall),
            ),
            Expanded(
              child: Text(value, style: theme.textTheme.bodyMedium),
            ),
          ],
        ),
      );

  Future<void> _emailReceipt(BuildContext context, Order order) async {
    final uri = Uri(
      scheme: 'mailto',
      path: AppConfig.contactEmailOrders,
      query: 'subject=Recibo ${order.number}'
          '&body=Solicito el recibo del pedido ${order.number} por '
          '${GhFormat.money(order.totals.total)}.',
    );
    try {
      await launchUrl(uri);
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Escríbenos a ${AppConfig.contactEmailOrders}')),
      );
    }
  }

  Future<void> _callSupport(BuildContext context) async {
    final uri = Uri(scheme: 'tel', path: AppConfig.contactPhonePrimary);
    try {
      await launchUrl(uri);
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Llama al ${AppConfig.contactPhonePrimaryPretty}')),
      );
    }
  }
}

class _OrderSkeleton extends StatelessWidget {
  const _OrderSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const <Widget>[
        ShimmerBox(width: double.infinity, height: 90),
        SizedBox(height: 16),
        ShimmerBox(width: double.infinity, height: 160),
        SizedBox(height: 16),
        ShimmerBox(width: double.infinity, height: 120),
      ],
    );
  }
}
