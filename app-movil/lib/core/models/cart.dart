import '../../core/utils/json.dart';
import 'catalog.dart';

/// Ítem del carrito (docs/02 §7).
class CartItem {
  const CartItem({
    required this.id,
    required this.product,
    required this.quantity,
    required this.unitPrice,
    this.notes,
    this.addedAt,
  });

  final String id;
  final Product product;
  final int quantity;
  final double unitPrice;
  final String? notes;
  final DateTime? addedAt;

  double get lineTotal => unitPrice * quantity;
  double get lineTax => lineTotal * (product.taxRate / 100);

  factory CartItem.fromJson(JsonMap json) {
    final productJson = json['product'] is Map
        ? asMap(json['product'])
        : <String, dynamic>{
            'id': json['productId'],
            'name': json['name'],
            'slug': json['slug'],
            'sku': json['sku'],
            'price': json['unitPrice'],
            'imageUrl': json['imageUrl'],
            'categorySlug': json['categorySlug'],
            'categoryName': json['categoryName'],
          };
    final product = Product.fromJson(productJson);
    return CartItem(
      id: asStringOr(json['id'], product.id),
      product: product,
      quantity: asIntOr(json['quantity'], 1),
      unitPrice: asDoubleOr(json['unitPrice'], product.price),
      notes: asString(json['notes']),
      addedAt: asDate(json['addedAt']),
    );
  }

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'productId': product.id,
        'product': product.toJson(),
        'quantity': quantity,
        'unitPrice': unitPrice,
        'notes': notes,
        'addedAt': addedAt?.toIso8601String(),
      };

  CartItem copyWith({int? quantity, String? notes}) => CartItem(
        id: id,
        product: product,
        quantity: quantity ?? this.quantity,
        unitPrice: unitPrice,
        notes: notes ?? this.notes,
        addedAt: addedAt,
      );
}

/// Totales del carrito / orden.
class CartTotals {
  const CartTotals({
    required this.subtotal,
    required this.discount,
    required this.tax,
    required this.total,
    this.currency = 'USD',
  });

  final double subtotal;
  final double discount;
  final double tax;
  final double total;
  final String currency;

  static const CartTotals zero = CartTotals(
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
  );

  factory CartTotals.fromJson(JsonMap json) => CartTotals(
        subtotal: asDoubleOr(json['subtotal'], 0),
        discount: asDoubleOr(json['discount'], 0),
        tax: asDoubleOr(json['tax'], 0),
        total: asDoubleOr(json['total'], 0),
        currency: asStringOr(json['currency'], 'USD'),
      );

  JsonMap toJson() => <String, dynamic>{
        'subtotal': subtotal,
        'discount': discount,
        'tax': tax,
        'total': total,
        'currency': currency,
      };
}

/// Carrito activo.
class Cart {
  const Cart({
    required this.id,
    this.items = const <CartItem>[],
    this.currency = 'USD',
  });

  final String id;
  final List<CartItem> items;
  final String currency;

  static const Cart empty = Cart(id: 'local-cart');

  bool get isEmpty => items.isEmpty;
  int get count => items.fold<int>(0, (sum, item) => sum + item.quantity);

  /// Subtotal, IVA (13 % CR) y total calculados en el propio carrito.
  CartTotals get totals {
    double subtotal = 0;
    double tax = 0;
    for (final item in items) {
      subtotal += item.lineTotal;
      tax += item.lineTax;
    }
    return CartTotals(
      subtotal: subtotal,
      discount: 0,
      tax: tax,
      total: subtotal + tax,
      currency: currency,
    );
  }

  bool contains(String productId) =>
      items.any((item) => item.product.id == productId);

  CartItem? itemFor(String productId) {
    for (final item in items) {
      if (item.product.id == productId) return item;
    }
    return null;
  }

  factory Cart.fromJson(JsonMap json) => Cart(
        id: asStringOr(json['id'], 'local-cart'),
        items: asList(json['items']).map(CartItem.fromJson).toList(),
        currency: asStringOr(json['currency'], 'USD'),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'items': items.map((e) => e.toJson()).toList(),
        'currency': currency,
        'totals': totals.toJson(),
      };

  Cart copyWith({List<CartItem>? items}) => Cart(
        id: id,
        items: items ?? this.items,
        currency: currency,
      );
}
