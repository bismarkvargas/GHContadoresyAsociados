import 'dart:convert';
import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/mock/mock_api_client.dart';
import 'package:gh_contadores/core/mock/mock_seed.dart';
import 'package:gh_contadores/core/models/site_info.dart';
import 'package:gh_contadores/core/models/user.dart';
import 'package:gh_contadores/core/providers/auth_provider.dart';
import 'package:gh_contadores/core/providers/core_providers.dart';
import 'package:gh_contadores/core/providers/push_permission_provider.dart';
import 'package:gh_contadores/core/providers/realtime_provider.dart';
import 'package:gh_contadores/core/realtime/mock_realtime_service.dart';
import 'package:gh_contadores/core/push/push_service.dart';
import 'package:gh_contadores/core/push/push_permission_service.dart';
import 'package:gh_contadores/core/widgets/product_card.dart';
import 'package:gh_contadores/features/splash/splash_screen.dart';
import 'package:gh_contadores/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_push.dart';

/// Helpers compartidos por los tests de widget.
class TestHarness {
  const TestHarness._();

  /// Canal de `flutter_secure_storage` simulado en memoria.
  static const MethodChannel _secureStorageChannel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');

  static final Map<String, String> _secureValues = <String, String>{};

  /// Doble de prueba del permiso de push, compartido por los tests del archivo.
  static FakePushPermissionService fakePush = FakePushPermissionService();

  /// Ruta del catálogo semilla dentro del proyecto.
  static const String _catalogAsset = 'assets/mock/catalog.seed.json';

  /// Prepara SharedPreferences, el almacenamiento seguro y el catálogo semilla.
  ///
  /// Además desactiva las dos fuentes de `Timer` que la app agenda en el
  /// arranque y que en el entorno de test nunca se completan (no hay canal de
  /// plataforma): el centro de notificaciones local y el mínimo visible del
  /// splash. Con esto el binding no encuentra temporizadores pendientes.
  static void prepare({
    bool onboardingDone = true,
    bool loggedIn = false,
  }) {
    _installSecureStorageMock();
    _secureValues.clear();
    if (loggedIn) _seedActiveSession();
    _installSeedCatalog();
    pushLocalNotificationsEnabled = false;
    splashMinimumVisible = Duration.zero;
    MockRealtimeService.autoEmitEnabled = false;
    // El permiso de push se simula **ya concedido** por defecto: los flujos que
    // no van del permiso (catálogo, carrito, pago) no deben toparse con el aviso
    // modal. Los tests del permiso lo dejan en «sin decidir» o «bloqueado» con
    // `fakePush.setStatus(...)`.
    fakePush = FakePushPermissionService(status: PushPermissionStatus.granted);
    // Estado global del modo demo: sin esto se filtra entre tests.
    MockApiClient.registrationConfig = const RegistrationConfig();
    // Sin latencia simulada: los `Future.delayed` del mock se resuelven en el
    // mismo turno del reloj virtual, así ningún test depende del tiempo real.
    mockLatencyOverride = Duration.zero;
    SharedPreferences.setMockInitialValues(<String, Object>{
      if (onboardingDone) 'gh_onboarding_done': true,
    });
  }

  /// Deja una sesión activa ya guardada, como una app abierta tras un login.
  ///
  /// Es más estable que loguearse en caliente dentro del test: el arranque
  /// restaura la sesión antes de decidir la ruta.
  static void _seedActiveSession() {
    final user = MockSeed.demoUser();
    final session = AuthSession(
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: DateTime.now().toUtc().add(const Duration(hours: 1)),
      user: user,
    );
    _secureValues['gh_access_token'] = session.accessToken;
    _secureValues['gh_refresh_token'] = session.refreshToken;
    _secureValues['gh_expires_at'] = session.expiresAt.toIso8601String();
    _secureValues['gh_cached_user'] = jsonEncode(user.toJson());
    // El MockApiClient también debe reconocer la sesión (si no, `me()` da 401).
    mockSessionUserOverride = user;
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
  /// Inyecta siempre el [MockApiClient] (nunca red real), un permiso de push
  /// simulado (sin canal de plataforma) y desactiva el sondeo de respaldo y la
  /// emisión periódica del tiempo real: en un test no debe quedar ningún
  /// `Timer.periodic` vivo ni salir ninguna petición a la red.
  static Future<void> pumpApp(
    WidgetTester tester, {
    List<Override> overrides = const <Override>[],
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[
          realtimePollingEnabledProvider.overrideWithValue(false),
          apiClientProvider.overrideWithValue(MockApiClient()),
          pushPermissionServiceProvider.overrideWithValue(fakePush),
          ...overrides,
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
  /// Acepta tanto el catálogo público (invitado, pestaña Servicios) como el
  /// inicio del cliente (con sesión activa, pestaña Inicio).
  ///
  /// No se usa `pumpAndSettle` porque el modo demo mantiene animaciones
  /// continuas (shimmer, indicadores) y la app nunca queda "en reposo".
  static Future<void> waitForBoot(WidgetTester tester) async {
    await tester.pump();
    for (int i = 0; i < 120; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      final enCatalogo =
          find.text('Buscar trámite, servicio o código…').evaluate().isNotEmpty;
      final enInicio = find.text('Estado de mis trámites').evaluate().isNotEmpty;
      if (enCatalogo || enInicio) return;
    }
  }

  /// Deja la app en la pestaña de servicios (catálogo).
  static Future<void> openCatalogTab(WidgetTester tester) async {
    final tab = navTab('Servicios');
    if (tab.evaluate().isNotEmpty) {
      await tester.tap(tab, warnIfMissed: false);
      await advance(tester, duration: const Duration(seconds: 1));
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
  ///
  /// Con sesión activa la app arranca en el inicio, así que primero se navega a
  /// la pestaña de servicios.
  static Future<void> waitForCatalog(WidgetTester tester) async {
    for (int i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      if (find.byType(ProductCard).evaluate().isNotEmpty) return;
    }
    await openCatalogTab(tester);
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
  ///
  /// La grilla es desplazable y la primera tarjeta queda por debajo del pliegue
  /// en la ventana de test (800×600), así que se desplaza hasta el botón antes
  /// de pulsarlo.
  static Future<void> addFirstProductToCart(WidgetTester tester) async {
    final addButton = find.byKey(const Key('product-add-to-cart'));
    expect(addButton, findsWidgets, reason: 'El catálogo debe tener tarjetas');

    await tester.scrollUntilVisible(
      addButton.first,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pump();

    await tester.tap(addButton.first, warnIfMissed: false);
    await advance(tester, duration: const Duration(seconds: 1));
  }

  /// Localiza la etiqueta de una pestaña **dentro de la barra de navegación**.
  ///
  /// Buscar el texto a secas puede encontrar una coincidencia en el contenido
  /// desplazado (fuera de la pantalla) en lugar de la pestaña.
  static Finder navTab(String label) {
    final bar = find.byType(NavigationBar);
    if (bar.evaluate().isNotEmpty) {
      final inBar = find.descendant(of: bar, matching: find.text(label));
      if (inBar.evaluate().isNotEmpty) return inBar.last;
    }
    final cupertino = find.byType(CupertinoTabBar);
    if (cupertino.evaluate().isNotEmpty) {
      final inBar = find.descendant(of: cupertino, matching: find.text(label));
      if (inBar.evaluate().isNotEmpty) return inBar.last;
    }
    final rail = find.byType(NavigationRail);
    if (rail.evaluate().isNotEmpty) {
      final inRail = find.descendant(of: rail, matching: find.text(label));
      if (inRail.evaluate().isNotEmpty) return inRail.last;
    }
    return find.text(label).last;
  }

  /// Navega a la pestaña del carrito y deja la vista en la parte superior.
  static Future<void> openCart(WidgetTester tester) async {
    final tab = navTab('Carrito');
    expect(tab, findsOneWidget, reason: 'La barra inferior debe tener Carrito');
    await tester.tap(tab, warnIfMissed: false);
    await advance(tester, duration: const Duration(seconds: 1));

    // El carrito es una lista: se vuelve al inicio para ver los ítems.
    final scrollable = find.byType(Scrollable);
    if (scrollable.evaluate().isNotEmpty) {
      await tester.drag(scrollable.first, const Offset(0, 600));
      await advance(tester, duration: const Duration(milliseconds: 600));
    }
  }

  /// Pasa del carrito al checkout (el `Text` interno del botón no es táctil).
  static Future<void> continueToCheckout(WidgetTester tester) async {
    final byKey = find.byKey(const Key('cart-continue-to-checkout'));

    // El botón vive al final de la lista del carrito: en la ventana de test hay
    // que desplazarse hasta él antes de pulsarlo.
    if (byKey.evaluate().isEmpty) {
      final scrollable = find.byType(Scrollable);
      if (scrollable.evaluate().isNotEmpty) {
        await tester.drag(scrollable.first, const Offset(0, -700));
        await advance(tester, duration: const Duration(milliseconds: 600));
      }
    }

    final target = byKey.evaluate().isNotEmpty
        ? byKey
        : find.ancestor(
            of: find.textContaining('Continuar al pago'),
            matching: find.byType(FilledButton),
          );
    expect(target, findsOneWidget, reason: 'Debe existir el botón de pago');

    await tester.ensureVisible(target);
    await tester.pump();
    await tester.tap(target, warnIfMissed: false);
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
