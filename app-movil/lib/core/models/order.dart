import '../../core/utils/json.dart';
import 'cart.dart';

/// Datos de facturación del checkout (docs/03 §3 `invoice{}`).
class InvoiceData {
  const InvoiceData({
    this.legalName = '',
    this.idNumber = '',
    this.email = '',
    this.phone,
    this.address,
    this.activityCode,
  });

  final String legalName;
  final String idNumber;
  final String email;
  final String? phone;
  final String? address;
  final String? activityCode;

  bool get isComplete =>
      legalName.trim().isNotEmpty &&
      idNumber.trim().isNotEmpty &&
      email.trim().isNotEmpty;

  factory InvoiceData.fromJson(JsonMap json) => InvoiceData(
        legalName: asStringOr(json['legalName'], ''),
        idNumber: asStringOr(json['idNumber'], ''),
        email: asStringOr(json['email'], ''),
        phone: asString(json['phone']),
        address: asString(json['address']),
        activityCode: asString(json['activityCode']),
      );

  JsonMap toJson() => <String, dynamic>{
        'legalName': legalName,
        'idNumber': idNumber,
        'email': email,
        'phone': phone,
        'address': address,
        'activityCode': activityCode,
      };
}

/// Ítem de la orden (snapshot del producto al momento de comprar).
class OrderItem {
  const OrderItem({
    required this.id,
    required this.productId,
    required this.nameSnapshot,
    required this.unitPrice,
    required this.quantity,
    required this.total,
    this.imageUrl,
    this.caseFileId,
    this.caseCode,
  });

  final String id;
  final String productId;
  final String nameSnapshot;
  final double unitPrice;
  final int quantity;
  final double total;
  final String? imageUrl;
  final String? caseFileId;
  final String? caseCode;

  factory OrderItem.fromJson(JsonMap json) => OrderItem(
        id: asStringOr(json['id'], ''),
        productId: asStringOr(json['productId'], ''),
        nameSnapshot: asStringOr(json['nameSnapshot'] ?? json['name'], 'Servicio'),
        unitPrice: asDoubleOr(json['unitPrice'], 0),
        quantity: asIntOr(json['quantity'], 1),
        total: asDoubleOr(json['total'], 0),
        imageUrl: asString(json['imageUrl']),
        caseFileId: asString(json['caseFileId']),
        caseCode: asString(json['caseCode']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'productId': productId,
        'nameSnapshot': nameSnapshot,
        'unitPrice': unitPrice,
        'quantity': quantity,
        'total': total,
        'imageUrl': imageUrl,
        'caseFileId': caseFileId,
        'caseCode': caseCode,
      };
}

/// Orden (`GH-ORD-2026-00001`).
class Order {
  const Order({
    required this.id,
    required this.number,
    required this.status,
    required this.totals,
    this.items = const <OrderItem>[],
    this.payment,
    this.notes,
    this.requiresInvoice = false,
    this.invoice,
    this.createdAt,
    this.paidAt,
    this.completedAt,
    this.caseCodes = const <String>[],
  });

  final String id;
  final String number;
  final String status;
  final CartTotals totals;
  final List<OrderItem> items;
  final PaymentResult? payment;
  final String? notes;
  final bool requiresInvoice;
  final InvoiceData? invoice;
  final DateTime? createdAt;
  final DateTime? paidAt;
  final DateTime? completedAt;
  final List<String> caseCodes;

  bool get isPayable => status == 'PendingPayment';
  bool get isPaid => status == 'Paid' || status == 'InProcess' || status == 'Completed';

  factory Order.fromJson(JsonMap json) => Order(
        id: asStringOr(json['id'], ''),
        number: asStringOr(json['number'], ''),
        status: asStringOr(json['status'], 'PendingPayment'),
        totals: CartTotals.fromJson(
          json['totals'] is Map
              ? asMap(json['totals'])
              : <String, dynamic>{
                  'subtotal': json['subtotal'],
                  'discount': json['discount'],
                  'tax': json['tax'],
                  'total': json['total'],
                  'currency': json['currency'],
                },
        ),
        items: asList(json['items']).map(OrderItem.fromJson).toList(),
        payment: json['payment'] == null
            ? null
            : PaymentResult.fromJson(asMap(json['payment'])),
        notes: asString(json['notes']),
        requiresInvoice: asBool(json['requiresInvoice']),
        invoice: json['invoice'] == null
            ? null
            : InvoiceData.fromJson(asMap(json['invoice'])),
        createdAt: asDate(json['createdAt']),
        paidAt: asDate(json['paidAt']),
        completedAt: asDate(json['completedAt']),
        caseCodes: asStringList(json['caseCodes']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'number': number,
        'status': status,
        'totals': totals.toJson(),
        'items': items.map((e) => e.toJson()).toList(),
        'payment': payment?.toJson(),
        'notes': notes,
        'requiresInvoice': requiresInvoice,
        'invoice': invoice?.toJson(),
        'createdAt': createdAt?.toIso8601String(),
        'paidAt': paidAt?.toIso8601String(),
        'completedAt': completedAt?.toIso8601String(),
        'caseCodes': caseCodes,
      };

  Order copyWith({
    String? status,
    PaymentResult? payment,
    DateTime? paidAt,
    List<String>? caseCodes,
  }) =>
      Order(
        id: id,
        number: number,
        status: status ?? this.status,
        totals: totals,
        items: items,
        payment: payment ?? this.payment,
        notes: notes,
        requiresInvoice: requiresInvoice,
        invoice: invoice,
        createdAt: createdAt,
        paidAt: paidAt ?? this.paidAt,
        completedAt: completedAt,
        caseCodes: caseCodes ?? this.caseCodes,
      );
}

/// Método de pago de la pasarela simulada (docs/02 §7).
enum PaymentMethod { card, sinpe, transfer }

String paymentMethodToJson(PaymentMethod method) {
  switch (method) {
    case PaymentMethod.card:
      return 'Card';
    case PaymentMethod.sinpe:
      return 'Sinpe';
    case PaymentMethod.transfer:
      return 'Transfer';
  }
}

String paymentMethodLabel(PaymentMethod method) {
  switch (method) {
    case PaymentMethod.card:
      return 'Tarjeta';
    case PaymentMethod.sinpe:
      return 'SINPE Móvil';
    case PaymentMethod.transfer:
      return 'Transferencia bancaria';
  }
}

/// Resultado del cobro (`POST /me/orders/{id}/pay`).
class PaymentResult {
  const PaymentResult({
    required this.id,
    required this.status,
    required this.amount,
    required this.method,
    this.provider = 'GH-Simulated',
    this.currency = 'USD',
    this.reference = '',
    this.authorizationCode,
    this.cardBrand,
    this.cardLast4,
    this.cardHolder,
    this.failureReason,
    this.createdAt,
    this.processedAt,
    this.instructions,
  });

  final String id;
  final String status; // Initiated | Approved | Declined | Pending | Refunded
  final double amount;
  final PaymentMethod method;
  final String provider;
  final String currency;
  final String reference;
  final String? authorizationCode;
  final String? cardBrand;
  final String? cardLast4;
  final String? cardHolder;
  final String? failureReason;
  final DateTime? createdAt;
  final DateTime? processedAt;

  /// Instrucciones para SINPE / transferencia en modo demo.
  final String? instructions;

  bool get isApproved => status == 'Approved';
  bool get isDeclined => status == 'Declined';
  bool get isPending => status == 'Pending';
  bool get isFinal => isApproved || isDeclined;

  factory PaymentResult.fromJson(JsonMap json) {
    final rawMethod = asStringOr(json['method'], 'Card');
    return PaymentResult(
      id: asStringOr(json['id'], ''),
      status: asStringOr(json['status'], 'Pending'),
      amount: asDoubleOr(json['amount'], 0),
      method: rawMethod == 'Sinpe'
          ? PaymentMethod.sinpe
          : rawMethod == 'Transfer'
              ? PaymentMethod.transfer
              : PaymentMethod.card,
      provider: asStringOr(json['provider'], 'GH-Simulated'),
      currency: asStringOr(json['currency'], 'USD'),
      reference: asStringOr(json['reference'], ''),
      authorizationCode: asString(json['authorizationCode']),
      cardBrand: asString(json['cardBrand']),
      cardLast4: asString(json['cardLast4']),
      cardHolder: asString(json['cardHolder']),
      failureReason: asString(json['failureReason']),
      createdAt: asDate(json['createdAt']),
      processedAt: asDate(json['processedAt']),
      instructions: asString(json['instructions']),
    );
  }

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'status': status,
        'amount': amount,
        'method': paymentMethodToJson(method),
        'provider': provider,
        'currency': currency,
        'reference': reference,
        'authorizationCode': authorizationCode,
        'cardBrand': cardBrand,
        'cardLast4': cardLast4,
        'cardHolder': cardHolder,
        'failureReason': failureReason,
        'createdAt': createdAt?.toIso8601String(),
        'processedAt': processedAt?.toIso8601String(),
        'instructions': instructions,
      };
}
