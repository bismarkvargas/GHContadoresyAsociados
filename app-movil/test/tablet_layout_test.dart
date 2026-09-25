import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/auth/biometric_service.dart';
import 'package:gh_contadores/core/mock/mock_seed.dart';
import 'package:gh_contadores/core/providers/biometric_provider.dart';
import 'package:gh_contadores/core/router/app_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_biometric.dart';
import 'helpers/test_harness.dart';

/// La app también se entrega para **tablets Android**. Estos tests montan la app
/// en tamaños de pantalla grandes (tablet en vertical y en horizontal) y
/// comprueban lo que puede romperse ahí: que la navegación cambie a
/// `NavigationRail`, que el login se pinte **sin desbordar** y que el flujo de
/// la huella (ofrecimiento tras el login y acceso con huella) siga funcionando.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeBiometricService fake;

  /// Monta la app con el tamaño de una tablet y la biometría simulada.
  Future<void> pumpTablet(
    WidgetTester tester, {
    Size size = const Size(1200, 1920), // tablet 10" en vertical (dp)
    bool linked = false,
    bool offered = true,
    bool loggedIn = false,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    TestHarness.prepare(loggedIn: loggedIn);
    SharedPreferences.setMockInitialValues(<String, Object>{
      'gh_onboarding_done': true,
      if (linked) kBiometricEnabledKey: true,
      if (linked) kBiometricOwnerKey: MockSeed.demoUser().id,
      kBiometricOfferedKey: offered,
    });

    fake = FakeBiometricService(label: 'su huella');
    await TestHarness.pumpApp(
      tester,
      overrides: <Override>[
        biometricServiceProvider.overrideWithValue(fake),
      ],
    );
    await TestHarness.waitForBoot(tester);
  }

  /// Lleva la app al login dentro del contenedor de la app completa.
  ///
  /// Se entra dos veces porque el cambio de sesión reconstruye el router y la
  /// primera navegación puede quedar a medias.
  Future<void> goToLogin(WidgetTester tester) async {
    TestHarness.container(tester).read(routerProvider).go(AppRoutes.login);
    await TestHarness.advance(tester, duration: const Duration(seconds: 1));
  }

  /// Inicia sesión con la cuenta demo en el formulario del login.
  Future<void> submitLogin(WidgetTester tester) async {
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Contraseña'),
      MockSeed.demoPassword,
    );
    await tester.pump();
    final entrar = find.widgetWithText(FilledButton, 'Iniciar sesión');
    await tester.ensureVisible(entrar);
    await tester.pump();
    await tester.tap(entrar, warnIfMissed: false);
    await TestHarness.advance(tester, duration: const Duration(seconds: 3));
  }

  group('Tablet Android', () {
    testWidgets('vertical: la app arranca con la barra de navegación de tablet',
        (tester) async {
      await pumpTablet(tester);

      // En pantallas de tablet el shell usa `NavigationRail` en lugar de la
      // barra inferior.
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(TestHarness.navTab('Servicios'), findsWidgets);
    });

    testWidgets(
        'el login se pinta sin desbordar en tablet vertical y horizontal',
        (tester) async {
      await pumpTablet(tester);
      await goToLogin(tester);

      // Un desbordamiento (`RenderFlex overflowed`) aparece como excepción.
      expect(tester.takeException(), isNull);
      expect(
        find.widgetWithText(TextFormField, 'Correo electrónico'),
        findsOneWidget,
      );
      expect(
        find.widgetWithText(FilledButton, 'Iniciar sesión'),
        findsOneWidget,
      );

      // Y lo mismo en horizontal (tablet girada).
      tester.view.physicalSize = const Size(1920, 1200);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));
      expect(tester.takeException(), isNull);
      expect(
        find.widgetWithText(FilledButton, 'Iniciar sesión'),
        findsOneWidget,
      );
    });

    testWidgets('en tablet ofrece activar la huella tras el login',
        (tester) async {
      await pumpTablet(tester, offered: false);
      await goToLogin(tester);
      await submitLogin(tester);
      // El login con contraseña deja la sesión guardada: la huella se vincula a esa cuenta.

      var shown = false;
      for (int i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 120));
        if (find
            .byKey(const Key('biometric-enable-dialog'))
            .evaluate()
            .isNotEmpty) {
          shown = true;
          break;
        }
      }
      expect(shown, isTrue, reason: 'En tablet también se ofrece la huella');
      expect(find.text('Activar huella'), findsOneWidget);

      await tester.tap(find.byKey(const Key('biometric-dialog-activate')));
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      final container = TestHarness.container(tester);
      expect(container.read(biometricProvider).isEnabled, isTrue);
      expect(fake.authenticateCount, 0);
    });

    testWidgets('en tablet la huella vinculada queda disponible para entrar',
        (tester) async {
      await pumpTablet(tester, linked: true, loggedIn: true);

      // Con la sesión guardada y la huella vinculada, el acceso biométrico está
      // disponible en el tablet igual que en el teléfono. Se espera la consulta
      // al sensor (es asíncrona) antes de comprobar el estado.
      final container = TestHarness.container(tester);
      await container.read(biometricProvider.notifier).refresh();
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      expect(
        container.read(biometricProvider).canUseBiometrics,
        isTrue,
        reason: 'El tablet tiene lector y huellas registradas',
      );
      expect(
        container.read(biometricProvider).isEnabled,
        isTrue,
        reason: 'La huella está vinculada a la cuenta con sesión guardada',
      );
      expect(fake.statusCount, greaterThan(0));
    });
  });
}
