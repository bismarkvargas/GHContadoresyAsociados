import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/widgets/product_card.dart';

import 'helpers/test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('navega al catálogo y muestra el catálogo real en modo demo',
      (tester) async {
    TestHarness.prepare();
    await TestHarness.pumpApp(tester);
    await TestHarness.waitForBoot(tester);

    // Encabezado del catálogo.
    expect(find.text('Servicios'), findsWidgets);

    // Pestañas de las 4 categorías reales (docs/01 §2).
    expect(find.text('Todos'), findsOneWidget);
    expect(find.text('Servicios Contables'), findsWidgets);
    expect(find.text('Servicios Legales'), findsWidgets);
    expect(find.text('Servicios Municipales'), findsWidgets);
    expect(find.text('Servicios Tributarios'), findsWidgets);

    // El catálogo del cliente se carga desde assets/mock/catalog.seed.json.
    await TestHarness.waitForCatalog(tester);
    expect(find.byType(ProductCard), findsWidgets);
    expect(find.textContaining('servicios'), findsWidgets);
  });

  testWidgets('el buscador filtra servicios del catálogo', (tester) async {
    TestHarness.prepare();
    await TestHarness.pumpApp(tester);
    await TestHarness.waitForBoot(tester);
    await TestHarness.waitForCatalog(tester);

    await tester.enterText(
      find.widgetWithText(TextField, 'Buscar trámite, servicio o código…'),
      'patente',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pumpAndSettle(const Duration(milliseconds: 300));

    expect(find.byType(ProductCard), findsWidgets);
    expect(find.textContaining('Patente'), findsWidgets);
  });

  testWidgets('abre la ficha de un servicio con precio y acciones',
      (tester) async {
    TestHarness.prepare();
    await TestHarness.pumpApp(tester);
    await TestHarness.waitForBoot(tester);
    await TestHarness.waitForCatalog(tester);

    await tester.tap(find.byType(ProductCard).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pumpAndSettle(const Duration(milliseconds: 400));

    expect(find.text('Descripción'), findsOneWidget);
    expect(find.text('Agregar al carrito'), findsWidgets);
    expect(find.text('Cotizar'), findsOneWidget);
    expect(find.text('Precio del servicio'), findsOneWidget);
    expect(find.textContaining('Duración estimada'), findsWidgets);
  });
}
