import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../core/models/account_request.dart';
import '../../core/models/catalog.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/cart_provider.dart';
import '../../core/providers/catalog_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';
import '../../core/widgets/product_card.dart';

/// Ficha de servicio: descripción, precio USD, duración estimada,
/// "Agregar al carrito" y "Solicitar cotización".
class ServiceDetailScreen extends ConsumerStatefulWidget {
  const ServiceDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<ServiceDetailScreen> createState() =>
      _ServiceDetailScreenState();
}

class _ServiceDetailScreenState extends ConsumerState<ServiceDetailScreen> {
  bool _isAdding = false;

  Future<void> _addToCart(Product product) async {
    setState(() => _isAdding = true);
    final ok = await ref.read(cartProvider.notifier).add(product);
    if (!mounted) return;
    setState(() => _isAdding = false);
    ref.read(cartProvider.notifier).consumeLastAdded();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? '${product.name} se agregó al carrito'
                : 'No pudimos agregarlo. Intenta de nuevo.',
          ),
          action: ok
              ? SnackBarAction(
                  label: 'Ir al carrito',
                  textColor: Colors.white,
                  onPressed: () => context.go(AppRoutes.cart),
                )
              : null,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(productDetailProvider(widget.slug));
    final categories = ref.watch(categoryBySlugProvider).valueOrNull;

    return Scaffold(
      body: detail.when(
        loading: () => const _ServiceDetailSkeleton(),
        error: (error, _) => Scaffold(
          appBar: AppBar(title: const Text('Servicio')),
          body: GhErrorState(
            message: 'No pudimos cargar esta ficha de servicio.',
            onRetry: () => ref.invalidate(productDetailProvider(widget.slug)),
          ),
        ),
        data: (data) {
          final product = data.product;
          final related = data.related;
          final category = categories?[product.categorySlug];

          return CustomScrollView(
            slivers: <Widget>[
              SliverAppBar(
                pinned: true,
                expandedHeight: 250,
                backgroundColor: Theme.of(context).colorScheme.surface,
                surfaceTintColor: Colors.transparent,
                leading: IconButton(
                  onPressed: () =>
                      context.canPop() ? context.pop() : context.go(AppRoutes.services),
                  icon: const Icon(Icons.arrow_back_rounded),
                  tooltip: 'Volver',
                ),
                actions: <Widget>[
                  IconButton(
                    onPressed: () => context.push(AppRoutes.messages),
                    icon: const Icon(Icons.forum_outlined),
                    tooltip: 'Mensajes',
                  ),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: Hero(
                    tag: 'product-image-${product.slug}',
                    child: GhProductImage(
                      imageUrl: product.imageUrl,
                      height: 250,
                      borderRadius: BorderRadius.zero,
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: <Widget>[
                          GhStatusBadge(
                            status: 'Active',
                            label: product.categoryName,
                            icon: category?.icon ?? Icons.grid_view_outlined,
                          ),
                          if (product.isFeatured)
                            const GhStatusBadge(
                              status: 'Approved',
                              label: 'Destacado',
                              icon: Icons.star_rounded,
                            ),
                          if (AppConfig.useMocks) const GhDemoChip(),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Text(
                        product.name,
                        style: Theme.of(context).textTheme.displayLarge?.copyWith(
                              fontSize: 26,
                              height: 1.15,
                            ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: <Widget>[
                          Text(
                            product.sku,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  letterSpacing: 0.6,
                                ),
                          ),
                          const SizedBox(width: 12),
                          const Icon(Icons.schedule_rounded,
                              size: 14, color: GhTokens.muted),
                          const SizedBox(width: 4),
                          Text(
                            'Duración estimada: ${product.estimatedLabel}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      GhCard(
                        child: Row(
                          children: <Widget>[
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(
                                    'Precio del servicio',
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                                  const SizedBox(height: 4),
                                  GhPriceTag(
                                    amount: product.price,
                                    currency: product.currency,
                                    showCrc: true,
                                    size: 28,
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: <Widget>[
                                Text(
                                  'IVA ${product.taxRate.toStringAsFixed(0)}%',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Total ${GhFormat.money(product.price * (1 + product.taxRate / 100))}',
                                  style:
                                      Theme.of(context).textTheme.labelMedium,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text('Descripción',
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 8),
                      Text(
                        product.displayDescription,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              height: 1.55,
                            ),
                      ),
                      const SizedBox(height: 20),
                      Text('Qué incluye',
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 12),
                      const _Bullet(text: 'Profesional asignado al expediente'),
                      const _Bullet(
                        text: 'Seguimiento en línea del avance del trámite',
                      ),
                      _Bullet(
                        text: product.requiresCase
                            ? 'Se abre un expediente digital al confirmar el pago'
                            : 'Entrega digital sin expediente',
                      ),
                      _Bullet(text: 'Modalidad: ${deliveryModeLabel(product.deliveryMode)}'),
                      _Bullet(
                        text: 'Notificaciones de cada actuación en tu teléfono',
                      ),
                      const SizedBox(height: 20),
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: _InfoTile(
                              icon: Icons.timer_outlined,
                              label: 'Duración',
                              value: product.estimatedLabel,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _InfoTile(
                              icon: Icons.attach_money_rounded,
                              label: 'Moneda',
                              value: product.currency,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      if (related.isNotEmpty) ...<Widget>[
                        Text('Servicios relacionados',
                            style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 12),
                      ],
                    ],
                  ),
                ),
              ),
              if (related.isNotEmpty)
                SliverToBoxAdapter(
                  child: SizedBox(
                    height: 252,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      itemCount: related.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 12),
                      itemBuilder: (context, index) => SizedBox(
                        width: 172,
                        child: ProductCard(product: related[index]),
                      ),
                    ),
                  ),
                ),
              const SliverToBoxAdapter(child: SizedBox(height: 120)),
            ],
          );
        },
      ),
      bottomNavigationBar: detail.maybeWhen(
        data: (data) => _BottomActions(
          product: data.product,
          isAdding: _isAdding,
          onAdd: () => _addToCart(data.product),
          onQuote: () => _showQuoteSheet(data.product),
        ),
        orElse: () => const SizedBox.shrink(),
      ),
    );
  }

  Future<void> _showQuoteSheet(Product product) async {
    final user = ref.read(currentUserProvider);
    final nameController = TextEditingController(text: user?.fullName ?? '');
    final emailController = TextEditingController(text: user?.email ?? '');
    final phoneController = TextEditingController(text: user?.phone ?? '');
    final messageController = TextEditingController();
    final formKey = GlobalKey<FormState>();
    bool isSending = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 8,
            bottom: MediaQuery.viewInsetsOf(sheetContext).bottom + 24,
          ),
          child: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    'Solicitar cotización',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    product.name,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: nameController,
                    decoration: const InputDecoration(labelText: 'Nombre completo *'),
                    validator: GhValidators.fullName,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: emailController,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Correo *'),
                    validator: GhValidators.email,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Teléfono *'),
                    validator: GhValidators.phoneCr,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: messageController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Detalle de tu necesidad *',
                      alignLabelWithHint: true,
                    ),
                    validator: (value) => GhValidators.message(value, min: 10),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: isSending
                          ? null
                          : () async {
                              if (!(formKey.currentState?.validate() ?? false)) {
                                return;
                              }
                              setSheetState(() => isSending = true);
                              try {
                                await ref.read(apiClientProvider).createQuoteRequest(
                                      QuoteRequest(
                                        fullName: nameController.text.trim(),
                                        email: emailController.text.trim(),
                                        phone: phoneController.text.trim(),
                                        message: messageController.text.trim(),
                                        serviceId: product.id,
                                        serviceName: product.name,
                                      ),
                                    );
                                if (sheetContext.mounted) {
                                  Navigator.of(sheetContext).pop();
                                }
                                if (!mounted) return;
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                      'Recibimos tu solicitud. Te contactaremos pronto.',
                                    ),
                                  ),
                                );
                              } catch (_) {
                                setSheetState(() => isSending = false);
                                if (!sheetContext.mounted) return;
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                      'No pudimos enviar la cotización. Intenta de nuevo.',
                                    ),
                                  ),
                                );
                              }
                            },
                      child: Text(isSending ? 'Enviando…' : 'Enviar cotización'),
                    ),
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

class _BottomActions extends StatelessWidget {
  const _BottomActions({
    required this.product,
    required this.isAdding,
    required this.onAdd,
    required this.onQuote,
  });

  final Product product;
  final bool isAdding;
  final VoidCallback onAdd;
  final VoidCallback onQuote;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: <Widget>[
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onQuote,
                icon: const Icon(Icons.request_quote_outlined, size: 18),
                label: const Text('Cotizar'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: FilledButton.icon(
                onPressed: isAdding ? null : onAdd,
                icon: isAdding
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.add_shopping_cart_rounded, size: 18),
                label: Text(isAdding ? 'Agregando…' : 'Agregar al carrito'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 20,
            height: 20,
            margin: const EdgeInsets.only(top: 1),
            decoration: const BoxDecoration(
              color: GhTokens.primary50,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_rounded, size: 13, color: GhTokens.primary),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: GhTokens.controlRadius,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18, color: GhTokens.primary),
          const SizedBox(height: 8),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 2),
          Text(value, style: Theme.of(context).textTheme.labelLarge),
        ],
      ),
    );
  }
}

class _ServiceDetailSkeleton extends StatelessWidget {
  const _ServiceDetailSkeleton();

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: <Widget>[
        const SliverToBoxAdapter(
          child: ShimmerBox(width: double.infinity, height: 250, radius: 0),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const <Widget>[
                ShimmerBox(width: 140, height: 24, radius: 12),
                SizedBox(height: 16),
                ShimmerBox(width: double.infinity, height: 26),
                SizedBox(height: 8),
                ShimmerBox(width: 200, height: 26),
                SizedBox(height: 20),
                ShimmerBox(width: double.infinity, height: 84),
                SizedBox(height: 20),
                ShimmerBox(width: double.infinity, height: 14),
                SizedBox(height: 8),
                ShimmerBox(width: double.infinity, height: 14),
                SizedBox(height: 8),
                ShimmerBox(width: 240, height: 14),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
