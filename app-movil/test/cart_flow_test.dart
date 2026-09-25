import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/providers/cart_provider.dart';
import 'package:gh_contadores/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'helpers/test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('agregar un servicio del catálogo lo suma al carrito',
      (tester) async {
    TestHarness.prepare();
    await TestHarness.pumpApp(tester);
    await TestHarness.waitForBoot(tester);
    await TestHarness.waitForCatalog(tester);

    // Estado inicial: carrito vacío.
    final element = tester.element(find.byType(MaterialApp).first);
    final container = ProviderScope.containerOf(element);
    expect(container.read(cartProvider).itemCount, 0);

    await TestHarness.addFirstProductToCart(tester);

    // El carrito ya tiene 1 unidad y el badge de la barra lo refleja.
    expect(container.read(cartProvider).itemCount, 1);
    expect(container.read(cartProvider).cart.items.length, 1);
    expect(find.text('1'), findsWidgets);
  });

  testWidgets('el carrito permite cambiar la cantidad y muestra los totales',
      (tester) async {
    TestHarness.prepare();
    await TestHarness.pumpApp(tester);
    await TestHarness.waitForBoot(tester);
    await TestHarness.waitForCatalog(tester);
    await TestHarness.addFirstProductToCart(tester);

    final element = tester.element(find.byType(MaterialApp).first);
    final container = ProviderScope.containerOf(element);

    await TestHarness.openCart(tester);
    expect(find.text('Subtotal'), findsOneWidget);
    expect(find.text('IVA (13 %)'), findsOneWidget);
    expect(find.text('Total a pagar'), findsOneWidget);
    expect(find.textContaining('Continuar al pago'), findsOneWidget);

    // Aumentar la cantidad con el selector accesible (+).
    final item = container.read(cartProvider).cart.items.first;
    await container
        .read(cartProvider.notifier)
        .updateQuantity(item.id, 3);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle(const Duration(milliseconds: 300));

    expect(container.read(cartProvider).itemCount, 3);
    expect(container.read(cartProvider).cart.items.first.quantity, 3);
  });
}
