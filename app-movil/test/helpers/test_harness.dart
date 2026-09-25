import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Helpers compartidos por los tests de widget.
class TestHarness {
  const TestHarness._();

  /// Prepara SharedPreferences con el onboarding ya completado.
  static void prepare({bool onboardingDone = true}) {
    SharedPreferences.setMockInitialValues(<String, Object>{
      if (onboardingDone) 'gh_onboarding_done': true,
    });
  }

  /// Monta la app completa con sus providers.
  static Future<void> pumpApp(WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: GhContadoresApp()));
  }

  /// Espera a que el splash y el arranque terminen.
  static Future<void> waitForBoot(WidgetTester tester) async {
    await tester.pump();
    for (int i = 0; i < 90; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      if (find.text('Servicios').evaluate().isNotEmpty &&
          find.text('Buscar trámite, servicio o código…').evaluate().isNotEmpty) {
        return;
      }
    }
    await tester.pumpAndSettle(const Duration(milliseconds: 200));
  }

  /// Espera a que el catálogo tenga tarjetas de servicio renderizadas.
  static Future<void> waitForCatalog(WidgetTester tester) async {
    for (int i = 0; i < 80; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      if (_addToCartButtons(tester) > 3) return;
    }
    await tester.pumpAndSettle(const Duration(milliseconds: 200));
  }

  static int _addToCartButtons(WidgetTester tester) {
    int count = 0;
    for (final element in find.byType(InkResponse).evaluate()) {
      final widget = element.widget as InkResponse;
      if (widget.onTap != null) count++;
    }
    return count;
  }

  /// Agrega el primer servicio del catálogo al carrito.
  static Future<void> addFirstProductToCart(WidgetTester tester) async {
    final button = find.byType(InkResponse).first;
    expect(button, findsOneWidget);
    await tester.tap(button);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle(const Duration(milliseconds: 300));
  }

  /// Navega a la pestaña del carrito.
  static Future<void> openCart(WidgetTester tester) async {
    await tester.tap(find.text('Carrito').last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle(const Duration(milliseconds: 300));
  }

  /// Completa los datos de facturación y avanza al pago.
  static Future<void> fillBillingAndContinue(WidgetTester tester) async {
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Razón social o nombre completo *'),
      'María Fernanda Rodríguez Solano',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Cédula / NIT *'),
      '1-1234-0567',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Correo para la factura *'),
      'maria.rodriguez@example.com',
    );
    await tester.pump();
    await tester.tap(find.text('Continuar al pago'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle(const Duration(milliseconds: 300));
  }

  /// Rellena la tarjeta indicada y paga.
  static Future<void> payWithCard(WidgetTester tester, String cardNumber) async {
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Número de tarjeta *'),
      cardNumber,
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Titular de la tarjeta *'),
      'MARIA F RODRIGUEZ',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Vencimiento *'),
      '12/30',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'CVV *'),
      '123',
    );
    await tester.pump();
    await tester.tap(find.text('Pagar ahora'));
    // La pasarela simulada tarda ~1,5 s en procesar.
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle(const Duration(milliseconds: 400));
  }
}
