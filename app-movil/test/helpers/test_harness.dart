import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/mock/mock_api_client.dart';
import 'package:gh_contadores/core/mock/mock_seed.dart';
import 'package:gh_contadores/core/providers/auth_provider.dart';
import 'package:gh_contadores/core/providers/realtime_provider.dart';
import 'package:gh_contadores/core/push/push_service.dart';
import 'package:gh_contadores/core/widgets/product_card.dart';
import 'package:gh_contadores/features/splash/splash_screen.dart';
import 'package:gh_contadores/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Helpers compartidos por los tests de widget.
class TestHarness {
  const TestHarness._();

  /// Canal de `flutter_secure_storage` simulado en memoria.
  static const MethodChannel _secureStorageChannel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');

  static final Map<String, String> _secureValues = <String, String>{};

  /// Ruta del catálogo semilla dentro del proyecto.
  static const String _catalogAsset = 'assets/mock/catalog.seed.json';

  /// Prepara SharedPreferences, el almacenamiento seguro y el catálogo semilla.
  ///
  /// Además desactiva las dos fuentes de `Timer` que la app agenda en el
  /// arranque y que en el entorno de test nunca se completan (no hay canal de
  /// plataforma): el centro de notificaciones local y el mínimo visible del
  /// splash. Con esto el binding no encuentra temporizadores pendientes.
  static void prepare({bool onboardingDone = true}) {
    _secureValues.clear();
    _installSecureStorageMock();
    _installSeedCatalog();
    pushLocalNotificationsEnabled = false;
    splashMinimumVisible = Duration.zero;
    // Sin latencia simulada: los `Future.delayed` del mock se resuelven en el
    // mismo turno del reloj virtual, así ningún test depende del tiempo real.
    mockLatencyOverride = Duration.zero;
    SharedPreferences.setMockInitialValues(<String, Object>{
      if (onboardingDone) 'gh_onboarding_done': true,
    });
  }

  /// Inyecta el catálogo real (mismo JSON que usa la app) en el cliente mock.
  ///
  /// Se lee del disco porque dentro de `testWidgets` el reloj es ficticio y
  /// `rootBundle.loadString` no completaría.
  static void _installSeedCatalog() {
    final file = File(_catalogAsset);
    if (!file.existsSync()) {
      throw FlutterError(
        'No se encontró el catálogo semilla en ${file.absolute.path}. '
        'Ejecuta los tests desde la raíz del proyecto (app-movil/).',
      );
    }
    MockApiClient.seedCatalogJsonOverride = file.readAsStringSync();
  }

  /// Responde a las llamadas del plugin de almacenamiento seguro.
  static void _installSecureStorageMock() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_secureStorageChannel, (call) async {
      switch (call.method) {
        case 'read':
          return _secureValues[(call.arguments as Map)['key']];
        case 'write':
          final args = call.arguments as Map;
          _secureValues[args['key'] as String] = args['value'] as String;
          return null;
        case 'delete':
          _secureValues.remove((call.arguments as Map)['key']);
          return null;
        case 'readAll':
          return Map<String, String>.from(_secureValues);
        case 'deleteAll':
          _secureValues.clear();
          return null;
        case 'containsKey':
          return _secureValues.containsKey((call.arguments as Map)['key']);
        default:
          return null;
      }
    });
  }

  /// Monta la app completa con sus providers.
  ///
  /// Se sobrescribe el sondeo de respaldo a desactivado: en los tests no hay
  /// backend al que consultar y un `Timer.periodic` vivo al acabar el test
  /// rompe la invariante `!timersPending` del binding de `flutter_test`.
  static Future<void> pumpApp(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[
          realtimePollingEnabledProvider.overrideWithValue(false),
        ],
        child: const GhContadoresApp(),
      ),
    );
    addTearDown(() => teardown(tester));
  }

  /// Contenedor de providers de la app montada (para inspeccionar el estado).
  static ProviderContainer container(WidgetTester tester) {
    return ProviderScope.containerOf(
      tester.element(find.byType(GhContadoresApp)),
    );
  }

  /// Inicia sesión con la cuenta demo activa.
  ///
  /// Necesario para los flujos que requieren sesión (carrito, checkout,
  /// expedientes): la app invitada los protege con estados de invitado.
  static Future<void> loginAsDemoUser(WidgetTester tester) async {
    final c = container(tester);
    final ok = await c.read(authProvider.notifier).login(
          email: MockSeed.demoUser().email,
          password: MockSeed.demoPassword,
        );
    expect(ok, isTrue, reason: 'El login demo debe funcionar');
    for (int i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      if (c.read(authProvider).isActive) break;
    }
  }

  /// Espera a que el splash y el arranque terminen.
  ///
  /// No se usa `pumpAndSettle` porque el modo demo mantiene animaciones
  /// continuas (shimmer, indicadores) y la app nunca queda "en reposo".
  static Future<void> waitForBoot(WidgetTester tester) async {
    await tester.pump();
    for (int i = 0; i < 120; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      if (find.text('Buscar trámite, servicio o código…').evaluate().isNotEmpty) {
        return;
      }
    }
  }

  /// Avanza el reloj virtual un tiempo determinado.
  static Future<void> advance(
    WidgetTester tester, {
    Duration duration = const Duration(seconds: 2),
    Duration step = const Duration(milliseconds: 120),
  }) async {
    final steps = (duration.inMilliseconds / step.inMilliseconds).ceil();
    for (int i = 0; i < steps; i++) {
      await tester.pump(step);
    }
  }

  /// Espera a que el catálogo tenga tarjetas de servicio renderizadas.
  static Future<void> waitForCatalog(WidgetTester tester) async {
    for (int i = 0; i < 100; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      if (find.byType(ProductCard).evaluate().isNotEmpty) return;
    }
  }

  /// Espera a que aparezca un texto concreto.
  static Future<bool> waitForText(
    WidgetTester tester,
    String text, {
    int attempts = 100,
  }) async {
    for (int i = 0; i < attempts; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      if (find.text(text).evaluate().isNotEmpty) return true;
    }
    return false;
  }

  /// Agrega el primer servicio del catálogo al carrito.
  static Future<void> addFirstProductToCart(WidgetTester tester) async {
    final card = find.byType(ProductCard).first;
    expect(card, findsOneWidget);

    // Botón de agregar dentro de la primera tarjeta (InkResponse con onTap).
    final addButton = find.descendant(
      of: card,
      matching: find.byType(InkResponse),
    );
    expect(addButton, findsWidgets);
    await tester.tap(addButton.first);
    await advance(tester, duration: const Duration(seconds: 1));
  }

  /// Navega a la pestaña del carrito.
  static Future<void> openCart(WidgetTester tester) async {
    await tester.tap(find.text('Carrito').last);
    await advance(tester, duration: const Duration(milliseconds: 900));
  }

  /// Pasa del carrito al checkout (el `Text` interno del botón no es táctil).
  static Future<void> continueToCheckout(WidgetTester tester) async {
    final byKey = find.byKey(const Key('cart-continue-to-checkout'));
    final target = byKey.evaluate().isNotEmpty
        ? byKey
        : find.ancestor(
            of: find.textContaining('Continuar al pago'),
            matching: find.byType(FilledButton),
          );
    expect(target, findsOneWidget);

    // El botón vive al final de una lista: hay que garantizar que sea visible.
    await tester.ensureVisible(target);
    await tester.pump();
    await tester.tap(target);
    await advance(tester, duration: const Duration(seconds: 3));
  }

  /// Cierra el test de forma limpia.
  ///
  /// Los `SnackBar` de confirmación dejan un `Timer` de auto-cierre; se retiran
  /// antes de desmontar el árbol para que el binding no encuentre timers
  /// pendientes (`!timersPending`) al terminar el test.
  static Future<void> teardown(WidgetTester tester) async {
    final messenger = find.byType(ScaffoldMessenger);
    if (messenger.evaluate().isNotEmpty) {
      tester
          .state<ScaffoldMessengerState>(messenger.first)
          .clearSnackBars();
    }
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    // Margen para animaciones de salida y temporizadores residuales.
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
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
    await advance(tester, duration: const Duration(seconds: 2));
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
    // La pasarela simulada tarda ~1,5 s en procesar; el mock suma su latencia.
    await advance(tester, duration: const Duration(seconds: 6));
  }
}
