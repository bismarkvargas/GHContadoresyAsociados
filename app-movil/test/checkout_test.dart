import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/providers/cart_provider.dart';

import 'helpers/test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Flujo completo hasta la pantalla de resultado con la tarjeta indicada.
  Future<void> runCheckout(WidgetTester tester, String cardNumber) async {
    TestHarness.prepare();
    await TestHarness.pumpApp(tester);
    await TestHarness.waitForBoot(tester);
    await TestHarness.waitForCatalog(tester);
    await TestHarness.addFirstProductToCart(tester);

    final container = TestHarness.container(tester);
    expect(container.read(cartProvider).itemCount, 1);

    await TestHarness.openCart(tester);
    await TestHarness.continueToCheckout(tester);

    // Paso 1: datos de facturación → crea la orden.
    expect(find.text('Datos de facturación'), findsOneWidget);
    await TestHarness.fillBillingAndContinue(tester);

    // Paso 2: método de pago con tarjeta.
    expect(find.text('Método de pago'), findsOneWidget);
    expect(find.text('4242 4242 4242 4242'), findsWidgets);
    expect(find.text('4000 0000 0000 0002'), findsWidgets);
    expect(find.text('4000 0000 0000 9995'), findsWidgets);

    await TestHarness.payWithCard(tester, cardNumber);
  }

  testWidgets('pago aprobado con 4242 4242 4242 4242 genera orden y expediente',
      (tester) async {
    await runCheckout(tester, '4242424242424242');

    expect(find.text('¡Pago aprobado!'), findsOneWidget);
    expect(find.textContaining('GH-ORD-'), findsWidgets);

    final container = TestHarness.container(tester);
    final checkout = container.read(checkoutProvider);
    expect(checkout.payment, isNotNull);
    expect(checkout.payment!.isApproved, isTrue);
    expect(checkout.payment!.cardLast4, '4242');
    expect(checkout.payment!.cardBrand, 'Visa');
    expect(checkout.payment!.authorizationCode, isNotNull);
    expect(checkout.order, isNotNull);
    // El pedido pagado genera expediente (docs/01 §5).
    expect(checkout.order!.caseCodes, isNotEmpty);
    // Y el carrito queda vacío tras la compra.
    expect(container.read(cartProvider).itemCount, 0);
  });

  testWidgets('pago rechazado con 4000 0000 0000 0002 permite reintentar',
      (tester) async {
    await runCheckout(tester, '4000000000000002');

    expect(find.text('Pago rechazado'), findsOneWidget);

    final container = TestHarness.container(tester);
    final checkout = container.read(checkoutProvider);
    expect(checkout.payment, isNotNull);
    expect(checkout.payment!.isDeclined, isTrue);
    expect(checkout.payment!.failureReason, isNotNull);
    // Sin expediente y sin aprobación: la orden sigue pendiente de pago.
    expect(checkout.order!.caseCodes, isEmpty);
    expect(checkout.order!.isPayable, isTrue);

    // Reintento: vuelve al paso de método de pago.
    final retry = find.byType(FilledButton).last;
    await tester.ensureVisible(retry);
    await tester.pump();
    await tester.tap(retry);
    await TestHarness.advance(tester, duration: const Duration(seconds: 2));
    expect(find.text('Método de pago'), findsOneWidget);
  });

  testWidgets('pago pendiente con 4000 0000 0000 9995 queda en revisión',
      (tester) async {
    await runCheckout(tester, '4000000000009995');

    expect(find.text('Pago en revisión'), findsOneWidget);

    final container = TestHarness.container(tester);
    final checkout = container.read(checkoutProvider);
    expect(checkout.payment!.isPending, isTrue);
    expect(checkout.order!.isPayable, isTrue);
  });

  testWidgets('el pago con SINPE Móvil queda pendiente con instrucciones',
      (tester) async {
    TestHarness.prepare();
    await TestHarness.pumpApp(tester);
    await TestHarness.waitForBoot(tester);
    await TestHarness.waitForCatalog(tester);
    await TestHarness.addFirstProductToCart(tester);

    await TestHarness.openCart(tester);
    await TestHarness.continueToCheckout(tester);
    await TestHarness.fillBillingAndContinue(tester);

    // Cambia a SINPE Móvil y paga.
    await tester.tap(find.text('SINPE'));
    await TestHarness.advance(
      tester,
      duration: const Duration(milliseconds: 600),
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Número emisor de SINPE Móvil *'),
      '+506 8888 8888',
    );
    await tester.pump();
    await tester.tap(find.text('Pagar ahora'));
    await TestHarness.advance(tester, duration: const Duration(seconds: 8));

    expect(find.text('Pago en revisión'), findsOneWidget);

    final container = TestHarness.container(tester);
    final checkout = container.read(checkoutProvider);
    expect(checkout.payment!.method.name, 'sinpe');
    expect(checkout.payment!.isPending, isTrue);
    expect(checkout.payment!.instructions, isNotNull);
  });
}
