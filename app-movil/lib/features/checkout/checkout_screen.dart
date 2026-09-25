import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../core/models/cart.dart';
import '../../core/models/order.dart';
import '../../core/network/api_client.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/cart_provider.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_state_views.dart';
import 'checkout_widgets.dart';

/// Checkout con pasarela simulada completa:
/// facturación → método de pago → procesamiento → resultado.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _billingFormKey = GlobalKey<FormState>();
  final _cardFormKey = GlobalKey<FormState>();

  final _legalName = TextEditingController();
  final _idNumber = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _notes = TextEditingController();

  final _cardNumber = TextEditingController();
  final _cardHolder = TextEditingController();
  final _cardExpiry = TextEditingController();
  final _cardCvv = TextEditingController();
  final _sinpePhone = TextEditingController(text: '${AppConfig.crDialCode} ');
  final _transferReference = TextEditingController();

  @override
  void initState() {
    super.initState();
    final user = ref.read(currentUserProvider);
    if (user != null) {
      _legalName.text = user.companyName ?? user.fullName;
      _idNumber.text = user.idNumber ?? '';
      _email.text = user.email;
      _phone.text = user.phone ?? '';
      _address.text = user.address ?? '';
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ref.read(cartProvider).cart.isEmpty &&
          ref.read(checkoutProvider).order == null) {
        context.go(AppRoutes.cart);
      }
    });
  }

  @override
  void dispose() {
    _legalName.dispose();
    _idNumber.dispose();
    _email.dispose();
    _phone.dispose();
    _address.dispose();
    _notes.dispose();
    _cardNumber.dispose();
    _cardHolder.dispose();
    _cardExpiry.dispose();
    _cardCvv.dispose();
    _sinpePhone.dispose();
    _transferReference.dispose();
    super.dispose();
  }

  Future<void> _submitBilling() async {
    if (!(_billingFormKey.currentState?.validate() ?? false)) return;
    final notifier = ref.read(checkoutProvider.notifier);
    notifier.setInvoice(
      InvoiceData(
        legalName: _legalName.text.trim(),
        idNumber: _idNumber.text.trim(),
        email: _email.text.trim(),
        phone: _phone.text.trim(),
        address: _address.text.trim(),
      ),
    );
    notifier.setNotes(_notes.text.trim());

    final ok = await ref
        .read(checkoutProvider.notifier)
        .createOrder(ref.read(cartProvider).cart.items);

    if (!mounted) return;
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ref.read(checkoutProvider).error ?? 'No pudimos crear la orden.',
          ),
        ),
      );
    }
  }

  Future<void> _submitPayment() async {
    final notifier = ref.read(checkoutProvider.notifier);
    final method = ref.read(checkoutProvider).method;
    if (method == PaymentMethod.card) {
      if (!(_cardFormKey.currentState?.validate() ?? false)) return;
      notifier.setCard(
        CardPaymentData(
          number: _cardNumber.text,
          expiry: _cardExpiry.text,
          cvv: _cardCvv.text,
          holder: _cardHolder.text.trim(),
        ),
      );
    } else if (method == PaymentMethod.sinpe) {
      final error = GhValidators.sinpePhone(_sinpePhone.text);
      if (error != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
        return;
      }
      notifier.setSinpePhone(_sinpePhone.text.trim());
    } else {
      final error = GhValidators.transferReference(_transferReference.text);
      if (error != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
        return;
      }
      notifier.setTransferReference(_transferReference.text.trim());
    }

    FocusScope.of(context).unfocus();
    await notifier.pay();
  }

  @override
  Widget build(BuildContext context) {
    final checkout = ref.watch(checkoutProvider);
    final cart = ref.watch(cartProvider).cart;

    final stepIndex = switch (checkout.step) {
      CheckoutStep.billing => 0,
      CheckoutStep.method => 1,
      CheckoutStep.processing => 1,
      CheckoutStep.result => 2,
    };

    return PopScope(
      canPop: checkout.step == CheckoutStep.billing ||
          checkout.step == CheckoutStep.result,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Espera a que termine el proceso de pago.')),
          );
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Finalizar compra'),
          automaticallyImplyLeading: checkout.step == CheckoutStep.processing
              ? false
              : true,
        ),
        body: SafeArea(
          child: Column(
            children: <Widget>[
              CheckoutStepper(current: stepIndex),
              const Divider(height: 1),
              Expanded(
                child: switch (checkout.step) {
                  CheckoutStep.billing => _buildBilling(cart),
                  CheckoutStep.method => _buildMethod(checkout, cart),
                  CheckoutStep.processing => const ProcessingCard(
                      message: 'Procesando tu pago…',
                      subtitle:
                          'Estamos validando la transacción con la pasarela segura.',
                    ),
                  CheckoutStep.result => _buildResult(checkout),
                },
              ),
            ],
          ),
        ),
        bottomNavigationBar: checkout.step == CheckoutStep.result
            ? null
            : checkout.step == CheckoutStep.processing
                ? null
                : _buildBottomBar(checkout, cart),
      ),
    );
  }

  // ---------- Paso 1: facturación ----------

  Widget _buildBilling(Cart cart) {
    final checkout = ref.watch(checkoutProvider);
    return Form(
      key: _billingFormKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: <Widget>[
          Text('Datos de facturación',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 6),
          Text(
            'Usaremos estos datos para la factura electrónica en Costa Rica.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 18),
          TextFormField(
            controller: _legalName,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Razón social o nombre completo *',
              prefixIcon: Icon(Icons.business_outlined),
            ),
            validator: (value) => GhValidators.required(
              value,
              field: 'La razón social',
            ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _idNumber,
            decoration: const InputDecoration(
              labelText: 'Cédula / NIT *',
              hintText: '1-1234-5678 o 3-101-123456',
              prefixIcon: Icon(Icons.badge_outlined),
            ),
            validator: (value) => GhValidators.idNumber(
              value,
              clientType: ref.read(currentUserProvider)?.clientType.name ?? 'Individual',
            ),
            inputFormatters: <TextInputFormatter>[
              FilteringTextInputFormatter.allow(RegExp(r'[0-9\-]')),
            ],
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Correo para la factura *',
              prefixIcon: Icon(Icons.mail_outline_rounded),
            ),
            validator: GhValidators.email,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Teléfono',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _address,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Dirección',
              prefixIcon: Icon(Icons.location_on_outlined),
            ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _notes,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Notas para la firma (opcional)',
              hintText: 'Detalles, plazos o requerimientos especiales',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 14),
          SwitchListTile(
            value: checkout.requiresInvoice,
            onChanged: (value) =>
                ref.read(checkoutProvider.notifier).setRequiresInvoice(value),
            contentPadding: EdgeInsets.zero,
            title: const Text('Requiero factura electrónica'),
            subtitle: const Text('Se emitirá con los datos indicados'),
          ),
          const SizedBox(height: 8),
          _SummaryCard(cart: cart),
        ],
      ),
    );
  }

  // ---------- Paso 2: método de pago ----------

  Widget _buildMethod(CheckoutState checkout, Cart cart) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: <Widget>[
        Text('Método de pago', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        Text(
          'Pasarela simulada GH-Simulated. Usa las tarjetas de prueba para '
          'reproducir cada resultado.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        SegmentedButton<PaymentMethod>(
          segments: const <ButtonSegment<PaymentMethod>>[
            ButtonSegment<PaymentMethod>(
              value: PaymentMethod.card,
              label: Text('Tarjeta'),
              icon: Icon(Icons.credit_card_rounded, size: 16),
            ),
            ButtonSegment<PaymentMethod>(
              value: PaymentMethod.sinpe,
              label: Text('SINPE'),
              icon: Icon(Icons.phone_iphone_rounded, size: 16),
            ),
            ButtonSegment<PaymentMethod>(
              value: PaymentMethod.transfer,
              label: Text('Transfer.'),
              icon: Icon(Icons.account_balance_outlined, size: 16),
            ),
          ],
          selected: <PaymentMethod>{checkout.method},
          onSelectionChanged: (selection) =>
              ref.read(checkoutProvider.notifier).setMethod(selection.first),
        ),
        const SizedBox(height: 20),
        if (checkout.method == PaymentMethod.card) ...<Widget>[
          GhCardPreview(
            number: _cardNumber.text,
            holder: _cardHolder.text,
            expiry: _cardExpiry.text,
          ),
          const SizedBox(height: 20),
          Form(
            key: _cardFormKey,
            child: CardFormFields(
              numberController: _cardNumber,
              holderController: _cardHolder,
              expiryController: _cardExpiry,
              cvvController: _cardCvv,
              onChanged: () => setState(() {}),
              onUseTestCard: (number) => setState(() {
                _cardNumber.text = number
                    .replaceAllMapped(
                      RegExp(r'.{4}'),
                      (match) => '${match.group(0)} ',
                    )
                    .trim();
                _cardHolder.text = _cardHolder.text.isEmpty
                    ? (_legalName.text.isEmpty ? 'CLIENTE GH' : _legalName.text)
                    : _cardHolder.text;
                _cardExpiry.text = _cardExpiry.text.isEmpty ? '12/29' : _cardExpiry.text;
                _cardCvv.text = _cardCvv.text.isEmpty ? '123' : _cardCvv.text;
              }),
            ),
          ),
        ],
        if (checkout.method == PaymentMethod.sinpe) ...<Widget>[
          GhInlineNotice(
            title: 'SINPE Móvil',
            message:
                'Envía el monto a la línea 8846 9454 (GH Contadores y Asociados) '
                'y confirma el número desde el que transferiste. En el modo demo el '
                'pago queda en estado «Pendiente» hasta que la firma lo verifique.',
            color: GhTokens.info,
            icon: Icons.phone_iphone_rounded,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _sinpePhone,
            keyboardType: TextInputType.phone,
            inputFormatters: <TextInputFormatter>[
              FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]')),
            ],
            decoration: const InputDecoration(
              labelText: 'Número emisor de SINPE Móvil *',
              hintText: '+506 8888 8888',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
          ),
        ],
        if (checkout.method == PaymentMethod.transfer) ...<Widget>[
          GhInlineNotice(
            title: 'Transferencia bancaria',
            message:
                'BAC Credomatic · Cuenta corriente 9021234567 a nombre de '
                'GH Contadores y Asociados S.A. · Cédula jurídica 3-101-778899. '
                'Registra el número de referencia de tu transferencia.',
            color: GhTokens.info,
            icon: Icons.account_balance_outlined,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _transferReference,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(
              labelText: 'Número de referencia *',
              hintText: 'BAC-2026-000123',
              prefixIcon: Icon(Icons.confirmation_number_outlined),
            ),
          ),
        ],
        const SizedBox(height: 20),
        _SummaryCard(cart: cart),
        const SizedBox(height: 12),
        GhInlineNotice(
          message:
              'Tus datos de tarjeta nunca se almacenan en la app: solo se envían '
              'a la pasarela para autorizar el cobro.',
          color: GhTokens.success,
          icon: Icons.lock_outline_rounded,
        ),
      ],
    );
  }

  // ---------- Paso 4: resultado ----------

  Widget _buildResult(CheckoutState checkout) {
    final payment = checkout.payment;
    final order = checkout.order;

    if (payment == null || order == null) {
      return const GhErrorState(
        title: 'Sin resultado de pago',
        message: 'No pudimos recuperar el resultado de la transacción.',
      );
    }

    final theme = Theme.of(context);
    final approved = payment.isApproved;
    final declined = payment.isDeclined;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: <Widget>[
        Center(
          child: ResultBadge(
            icon: approved
                ? Icons.check_rounded
                : declined
                    ? Icons.close_rounded
                    : Icons.hourglass_top_rounded,
            color: approved
                ? GhTokens.success
                : declined
                    ? GhTokens.danger
                    : GhTokens.warning,
          ),
        ),
        const SizedBox(height: 20),
        Text(
          approved
              ? '¡Pago aprobado!'
              : declined
                  ? 'Pago rechazado'
                  : 'Pago en revisión',
          textAlign: TextAlign.center,
          style: theme.textTheme.headlineMedium,
        ),
        const SizedBox(height: 8),
        Text(
          approved
              ? 'Tu compra fue confirmada. Abrimos el expediente y te avisaremos '
                  'de cada avance.'
              : declined
                  ? payment.failureReason ??
                      'La tarjeta fue rechazada por el emisor. Puedes intentar con '
                          'otro método de pago.'
                  : payment.instructions ??
                      'Tu pago quedó pendiente de verificación por parte de la firma.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 24),
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
                        Text('Orden', style: theme.textTheme.bodySmall),
                        const SizedBox(height: 2),
                        Text(order.number, style: theme.textTheme.titleMedium),
                      ],
                    ),
                  ),
                  GhStatusBadge(status: payment.status),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 14),
                child: Divider(),
              ),
              _DetailRow(
                label: 'Monto',
                value: GhFormat.money(payment.amount, currency: payment.currency),
                highlight: true,
              ),
              _DetailRow(
                label: 'Método',
                value: paymentMethodLabel(payment.method),
              ),
              if (payment.cardLast4 != null)
                _DetailRow(
                  label: 'Tarjeta',
                  value: GhFormat.cardMasked(payment.cardBrand, payment.cardLast4),
                ),
              if (payment.cardHolder != null)
                _DetailRow(label: 'Titular', value: payment.cardHolder!),
              if (payment.authorizationCode != null)
                _DetailRow(
                  label: 'Autorización',
                  value: payment.authorizationCode!,
                ),
              _DetailRow(label: 'Referencia', value: payment.reference),
              _DetailRow(
                label: 'Fecha',
                value: GhFormat.dateTime(payment.processedAt ?? payment.createdAt),
              ),
              if (order.caseCodes.isNotEmpty)
                _DetailRow(
                  label: 'Expediente',
                  value: order.caseCodes.join(', '),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (order.isPaid && order.caseCodes.isNotEmpty)
          GhInlineNotice(
            title: 'Expediente abierto',
            message:
                'Ya puedes seguir el avance de ${order.caseCodes.first} en Mis '
                'expedientes y subir tus documentos.',
            color: GhTokens.success,
            icon: Icons.folder_shared_outlined,
          ),
        const SizedBox(height: 24),
        if (approved)
          FilledButton.icon(
            onPressed: () {
              ref.read(checkoutProvider.notifier).reset();
              if (order.caseCodes.isNotEmpty) {
                context.go(AppRoutes.cases);
              } else {
                context.go(AppRoutes.home);
              }
            },
            icon: const Icon(Icons.folder_open_rounded, size: 18),
            label: const Text('Ver mis expedientes'),
          ),
        if (!approved)
          FilledButton.icon(
            onPressed: () => ref.read(checkoutProvider.notifier).retry(),
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Intentar de nuevo'),
          ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () => context.push(AppRoutes.orderDetail(order.id)),
          icon: const Icon(Icons.receipt_long_outlined, size: 18),
          label: const Text('Ver detalle del pedido'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () {
            ref.read(checkoutProvider.notifier).reset();
            context.go(AppRoutes.home);
          },
          child: const Text('Volver al inicio'),
        ),
      ],
    );
  }

  Widget _buildBottomBar(CheckoutState checkout, Cart cart) {
    final isBilling = checkout.step == CheckoutStep.billing;
    final total = checkout.order?.totals.total ?? cart.totals.total;

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
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text('Total', style: Theme.of(context).textTheme.bodySmall),
                Text(
                  GhFormat.money(total),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: GhTokens.primary,
                      ),
                ),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: FilledButton.icon(
                onPressed: checkout.isBusy
                    ? null
                    : (isBilling ? _submitBilling : _submitPayment),
                icon: checkout.isBusy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Icon(
                        isBilling
                            ? Icons.arrow_forward_rounded
                            : Icons.lock_outline_rounded,
                        size: 18,
                      ),
                label: Text(
                  checkout.isBusy
                      ? 'Procesando…'
                      : (isBilling ? 'Continuar al pago' : 'Pagar ahora'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Resumen de tu compra', style: theme.textTheme.labelLarge),
          const SizedBox(height: 12),
          for (final item in cart.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      '${item.quantity} × ${item.product.name}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    GhFormat.money(item.lineTotal),
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(),
          ),
          Row(
            children: <Widget>[
              Text('Subtotal', style: theme.textTheme.bodySmall),
              const Spacer(),
              Text(GhFormat.money(cart.totals.subtotal),
                  style: theme.textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: <Widget>[
              Text('IVA (13 %)', style: theme.textTheme.bodySmall),
              const Spacer(),
              Text(GhFormat.money(cart.totals.tax), style: theme.textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: <Widget>[
              Text('Total', style: theme.textTheme.titleMedium),
              const Spacer(),
              GhPriceTag(amount: cart.totals.total, size: 20),
            ],
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              '≈ ${GhFormat.moneyCrc(cart.totals.total)}',
              style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 110,
            child: Text(label, style: theme.textTheme.bodySmall),
          ),
          Expanded(
            child: Text(
              value,
              style: highlight
                  ? theme.textTheme.titleMedium?.copyWith(color: GhTokens.primary)
                  : theme.textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }
}
