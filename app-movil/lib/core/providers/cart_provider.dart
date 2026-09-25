import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../error/api_failure.dart';
import '../models/cart.dart';
import '../models/catalog.dart';
import '../models/order.dart';
import '../network/api_client.dart' show CardPaymentData;
import '../utils/json.dart';
import 'core_providers.dart';

/// Carrito del cliente (`/me/cart`).
class CartState {
  const CartState({
    this.cart = Cart.empty,
    this.isLoading = false,
    this.isMutating = false,
    this.error,
    this.lastAddedProduct,
  });

  final Cart cart;
  final bool isLoading;
  final bool isMutating;
  final String? error;

  /// Nombre del último servicio agregado (para el SnackBar/toast).
  final String? lastAddedProduct;

  int get itemCount => cart.count;
  bool get isEmpty => cart.isEmpty;

  CartState copyWith({
    Cart? cart,
    bool? isLoading,
    bool? isMutating,
    String? error,
    String? lastAddedProduct,
    bool clearError = false,
    bool clearLastAdded = false,
  }) =>
      CartState(
        cart: cart ?? this.cart,
        isLoading: isLoading ?? this.isLoading,
        isMutating: isMutating ?? this.isMutating,
        error: clearError ? null : (error ?? this.error),
        lastAddedProduct:
            clearLastAdded ? null : (lastAddedProduct ?? this.lastAddedProduct),
      );
}

class CartNotifier extends StateNotifier<CartState> {
  CartNotifier(this._ref) : super(const CartState());

  final Ref _ref;

  Future<void> load() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final client = await _ref.read(apiBootstrapProvider.future);
      final cart = await client.getCart();
      if (!mounted) return;
      state = state.copyWith(cart: cart, isLoading: false);
    } on ApiFailure catch (e) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, error: e.message);
    }
  }

  Future<bool> add(Product product, {int quantity = 1}) async {
    state = state.copyWith(isMutating: true, clearError: true);
    try {
      final client = await _ref.read(apiBootstrapProvider.future);
      final cart = await client.addCartItem(
        productId: product.id,
        quantity: quantity,
      );
      if (!mounted) return true;
      state = state.copyWith(
        cart: cart,
        isMutating: false,
        lastAddedProduct: product.name,
      );
      return true;
    } on ApiFailure catch (e) {
      if (!mounted) return false;
      state = state.copyWith(isMutating: false, error: e.message);
      return false;
    }
  }

  Future<void> updateQuantity(String itemId, int quantity) async {
    state = state.copyWith(isMutating: true);
    try {
      final client = await _ref.read(apiBootstrapProvider.future);
      final cart = await client.updateCartItem(itemId: itemId, quantity: quantity);
      if (!mounted) return;
      state = state.copyWith(cart: cart, isMutating: false);
    } on ApiFailure catch (e) {
      if (!mounted) return;
      state = state.copyWith(isMutating: false, error: e.message);
    }
  }

  Future<void> remove(String itemId) async {
    state = state.copyWith(isMutating: true);
    try {
      final client = await _ref.read(apiBootstrapProvider.future);
      final cart = await client.removeCartItem(itemId);
      if (!mounted) return;
      state = state.copyWith(cart: cart, isMutating: false);
    } on ApiFailure catch (e) {
      if (!mounted) return;
      state = state.copyWith(isMutating: false, error: e.message);
    }
  }

  Future<void> clear() async {
    state = state.copyWith(isMutating: true);
    try {
      final client = await _ref.read(apiBootstrapProvider.future);
      final cart = await client.clearCart();
      if (!mounted) return;
      state = state.copyWith(cart: cart, isMutating: false);
    } on ApiFailure catch (e) {
      if (!mounted) return;
      state = state.copyWith(isMutating: false, error: e.message);
    }
  }

  void consumeLastAdded() => state = state.copyWith(clearLastAdded: true);

  /// ¿El carrito ya contiene este servicio?
  bool contains(String productId) => state.cart.contains(productId);
}

final cartProvider = StateNotifierProvider<CartNotifier, CartState>((ref) {
  return CartNotifier(ref);
});

/// Contador del badge del carrito en la navegación.
final cartBadgeProvider = Provider<int>((ref) => ref.watch(cartProvider).itemCount);

// ---------- Checkout ----------

/// Paso actual del flujo de compra.
enum CheckoutStep { billing, method, processing, result }

/// Estado completo del checkout con pasarela simulada.
class CheckoutState {
  const CheckoutState({
    this.step = CheckoutStep.billing,
    this.requiresInvoice = true,
    this.invoice = const InvoiceData(),
    this.method = PaymentMethod.card,
    this.card,
    this.sinpePhone = '',
    this.transferReference = '',
    this.notes = '',
    this.isBusy = false,
    this.error,
    this.order,
    this.payment,
  });

  final CheckoutStep step;
  final bool requiresInvoice;
  final InvoiceData invoice;
  final PaymentMethod method;
  final CardPaymentData? card;
  final String sinpePhone;
  final String transferReference;
  final String notes;
  final bool isBusy;
  final String? error;
  final Order? order;
  final PaymentResult? payment;

  CheckoutState copyWith({
    CheckoutStep? step,
    bool? requiresInvoice,
    InvoiceData? invoice,
    PaymentMethod? method,
    CardPaymentData? card,
    String? sinpePhone,
    String? transferReference,
    String? notes,
    bool? isBusy,
    String? error,
    Order? order,
    PaymentResult? payment,
    bool clearError = false,
    bool clearPayment = false,
  }) =>
      CheckoutState(
        step: step ?? this.step,
        requiresInvoice: requiresInvoice ?? this.requiresInvoice,
        invoice: invoice ?? this.invoice,
        method: method ?? this.method,
        card: card ?? this.card,
        sinpePhone: sinpePhone ?? this.sinpePhone,
        transferReference: transferReference ?? this.transferReference,
        notes: notes ?? this.notes,
        isBusy: isBusy ?? this.isBusy,
        error: clearError ? null : (error ?? this.error),
        order: order ?? this.order,
        payment: clearPayment ? null : (payment ?? this.payment),
      );
}

class CheckoutNotifier extends StateNotifier<CheckoutState> {
  CheckoutNotifier(this._ref) : super(const CheckoutState());

  final Ref _ref;

  void goToStep(CheckoutStep step) => state = state.copyWith(step: step);

  void setInvoice(InvoiceData invoice) => state = state.copyWith(invoice: invoice);

  void setRequiresInvoice(bool value) =>
      state = state.copyWith(requiresInvoice: value);

  void setMethod(PaymentMethod method) => state = state.copyWith(method: method);

  void setCard(CardPaymentData card) => state = state.copyWith(card: card);

  void setSinpePhone(String value) => state = state.copyWith(sinpePhone: value);

  void setTransferReference(String value) =>
      state = state.copyWith(transferReference: value);

  void setNotes(String value) => state = state.copyWith(notes: value);

  void reset() => state = const CheckoutState();

  /// Crea la orden (`POST /me/orders`) y pasa a la selección de pago.
  Future<bool> createOrder(List<CartItem> items) async {
    if (items.isEmpty) {
      state = state.copyWith(error: 'Tu carrito está vacío.');
      return false;
    }
    state = state.copyWith(isBusy: true, clearError: true);
    try {
      final client = await _ref.read(apiBootstrapProvider.future);
      final order = await client.createOrder(
        items: items,
        invoice: state.requiresInvoice ? state.invoice : null,
        requiresInvoice: state.requiresInvoice,
        notes: state.notes.trim().isEmpty ? null : state.notes.trim(),
      );
      if (!mounted) return true;
      state = state.copyWith(
        order: order,
        isBusy: false,
        step: CheckoutStep.method,
      );
      return true;
    } on ApiFailure catch (e) {
      if (!mounted) return false;
      state = state.copyWith(isBusy: false, error: e.message);
      return false;
    }
  }

  /// Ejecuta el cobro en la pasarela simulada (`POST /me/orders/{id}/pay`).
  Future<PaymentResult?> pay() async {
    final order = state.order;
    if (order == null) {
      state = state.copyWith(error: 'No hay una orden pendiente de pago.');
      return null;
    }
    if (state.method == PaymentMethod.card && state.card == null) {
      state = state.copyWith(error: 'Completa los datos de la tarjeta.');
      return null;
    }

    state = state.copyWith(isBusy: true, clearError: true, step: CheckoutStep.processing);
    try {
      final client = await _ref.read(apiBootstrapProvider.future);
      final payment = await client.payOrder(
        orderId: order.id,
        method: state.method,
        card: state.method == PaymentMethod.card ? state.card : null,
        sinpePhone: state.method == PaymentMethod.sinpe ? state.sinpePhone : null,
        transferReference:
            state.method == PaymentMethod.transfer ? state.transferReference : null,
      );
      Order? updated;
      try {
        updated = await client.getOrder(order.id);
      } catch (_) {
        updated = order;
      }
      if (!mounted) return payment;
      state = state.copyWith(
        isBusy: false,
        payment: payment,
        order: updated,
        step: CheckoutStep.result,
      );
      if (payment.isApproved) {
        await _ref.read(cartProvider.notifier).load();
      }
      return payment;
    } on ApiFailure catch (e) {
      if (!mounted) return null;
      state = state.copyWith(
        isBusy: false,
        error: e.message,
        step: CheckoutStep.method,
      );
      return null;
    }
  }

  /// Reintenta el pago tras un rechazo.
  void retry() => state = state.copyWith(
        step: CheckoutStep.method,
        clearPayment: true,
        clearError: true,
      );
}

final checkoutProvider =
    StateNotifierProvider<CheckoutNotifier, CheckoutState>((ref) {
  return CheckoutNotifier(ref);
});

// ---------- Historial de compras ----------

final ordersProvider = FutureProvider.autoDispose<List<Order>>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getOrders(pageSize: 50);
  return result.items;
});

final ordersByStatusProvider =
    FutureProvider.autoDispose.family<List<Order>, String>((ref, status) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getOrders(
    status: status == 'all' ? null : status,
    pageSize: 50,
  );
  return result.items;
});

final orderDetailProvider =
    FutureProvider.autoDispose.family<Order, String>((ref, id) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  return client.getOrder(id);
});

/// Utilidad usada por el checkout para serializar el carrito en logs de demo.
String checkoutDebugDump(Cart cart) => prettyJson(cart.toJson());
