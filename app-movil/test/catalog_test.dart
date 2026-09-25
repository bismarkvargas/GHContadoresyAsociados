import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/providers/core_providers.dart';
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

    // Pestañas de categorías (la primera siempre visible).
    await TestHarness.waitForText(tester, 'Todos');
    expect(find.text('Todos'), findsOneWidget);

    // Las 4 categorías reales del cliente están cargadas (docs/01 §2).
    final container = TestHarness.container(tester);
    final categories = await container.read(categoriesProvider.future);
    expect(categories.map((c) => c.slug).toList(), <String>[
      'servicios-contables',
      'servicios-legales',
      'servicios-municipales',
      'servicios-tributarios',
    ]);
    expect(categories.map((c) => c.productCount).reduce((a, b) => a + b), 62);

    // El catálogo del cliente se carga desde assets/mock/catalog.seed.json.
    await TestHarness.waitForCatalog(tester);
    expect(find.byType(ProductCard), findsWidgets);
    expect(find.textContaining('62 servicios'), findsWidgets);
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
    await TestHarness.advance(tester, duration: const Duration(seconds: 2));

    expect(find.byType(ProductCard), findsWidgets);
    expect(find.textContaining('Patente'), findsWidgets);
  });

  testWidgets('abre la ficha de un servicio con precio, duración y acciones',
      (tester) async {
    TestHarness.prepare();
    await TestHarness.pumpApp(tester);
    await TestHarness.waitForBoot(tester);
    await TestHarness.waitForCatalog(tester);

    await tester.tap(find.byType(ProductCard).first);
    await TestHarness.advance(tester, duration: const Duration(seconds: 2));

    expect(find.text('Descripción'), findsOneWidget);
    expect(find.text('Agregar al carrito'), findsWidgets);
    expect(find.text('Cotizar'), findsOneWidget);
    expect(find.text('Precio del servicio'), findsOneWidget);
    expect(find.textContaining('Duración estimada'), findsWidgets);
    expect(find.textContaining('Qué incluye'), findsOneWidget);
  });
}
