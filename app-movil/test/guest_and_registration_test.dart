import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/mock/mock_api_client.dart';
import 'package:gh_contadores/core/models/site_info.dart';
import 'package:gh_contadores/core/providers/auth_provider.dart';
import 'package:gh_contadores/core/providers/cart_provider.dart';
import 'package:gh_contadores/core/providers/core_providers.dart';
import 'package:gh_contadores/core/providers/guest_provider.dart';

import 'helpers/test_harness.dart';

/// Estados de invitado: la app nunca falla en silencio ni muestra errores
/// técnicos cuando no hay sesión.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Invitado (sin sesión)', () {
    testWidgets('el carrito invita a iniciar sesión en vez de fallar',
        (tester) async {
      TestHarness.prepare(); // sin sesión
      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);
      await TestHarness.waitForCatalog(tester);

      final container = TestHarness.container(tester);
      expect(container.read(cartProvider).itemCount, 0);

      // Pulsar "agregar" abre la hoja de invitado y NO agrega nada.
      await TestHarness.addFirstProductToCart(tester);

      expect(
        find.text('Inicie sesión para agregar servicios a su carrito'),
        findsWidgets,
      );
      expect(find.byKey(const Key('guest-sheet-login')), findsOneWidget);
      expect(find.byKey(const Key('guest-sheet-register')), findsOneWidget);
      expect(container.read(cartProvider).itemCount, 0);
    });

    testWidgets('la hoja de invitado lleva a la pantalla de login',
        (tester) async {
      TestHarness.prepare();
      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);
      await TestHarness.waitForCatalog(tester);
      await TestHarness.addFirstProductToCart(tester);

      await tester.tap(find.byKey(const Key('guest-sheet-login')));
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      // Nos deja en el login con la intención recordada.
      expect(find.text('Iniciar sesión'), findsWidgets);
      expect(
        TestHarness.container(tester).read(pendingGuestActionProvider)?.intent,
        GuestIntent.addToCart,
      );
    });

    testWidgets('las pantallas privadas muestran estado de invitado',
        (tester) async {
      TestHarness.prepare();
      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);

      Future<void> abrir(String tabLabel) async {
        final tab = TestHarness.navTab(tabLabel);
        await tester.tap(tab, warnIfMissed: false);
        await TestHarness.advance(
          tester,
          duration: const Duration(milliseconds: 900),
        );
      }

      await abrir('Expedientes');
      expect(find.text('Inicie sesión para ver sus expedientes'), findsWidgets);
      expect(find.byKey(const Key('guest-login-button')), findsWidgets);

      await abrir('Perfil');
      expect(find.byKey(const Key('guest-login-button')), findsWidgets);
      expect(find.byKey(const Key('guest-register-button')), findsWidgets);
    });

    testWidgets('el inicio muestra la tarjeta de invitado', (tester) async {
      TestHarness.prepare();
      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);

      // Ir al inicio (pestaña Inicio).
      await tester.tap(TestHarness.navTab('Inicio'), warnIfMissed: false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      expect(
        find.text('Inicie sesión para seguir el avance de sus trámites'),
        findsWidgets,
      );
      expect(find.byKey(const Key('guest-banner-login')), findsOneWidget);
      expect(find.byKey(const Key('guest-banner-register')), findsOneWidget);
    });
  });

  group('Registro de cuenta configurable', () {
    testWidgets('modo automático: texto de bienvenida y creación de cuenta',
        (tester) async {
      TestHarness.prepare();
      MockApiClient.registrationConfig = const RegistrationConfig(
        mode: 'automatic',
        autoApprove: true,
        message: 'Su cuenta se crea al instante.',
      );

      await TestHarness.pumpApp(
        tester,
        overrides: <Override>[
          siteInfoProvider.overrideWith(
            (ref) async => SiteInfo.fromJson(<String, dynamic>{
              'registration': <String, dynamic>{
                'mode': 'automatic',
                'autoApprove': true,
                'message': 'Su cuenta se crea al instante.',
              },
            }),
          ),
        ],
      );
      await TestHarness.waitForBoot(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      // Abrir el registro desde el estado de invitado.
      await tester.tap(TestHarness.navTab('Perfil'), warnIfMissed: false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));
      await tester.tap(find.byKey(const Key('guest-register-button')).first);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      expect(
        find.text('Cree su cuenta y empiece a comprar de inmediato'),
        findsWidgets,
      );

      // Los campos de contraseña están al final del formulario: hay que
      // desplazarse hasta ellos (en la ventana de test quedan bajo el pliegue).
      final scrollable = find.byType(Scrollable).last;
      await tester.drag(scrollable, const Offset(0, -900));
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      final passField = find.ancestor(
        of: find.text('Contraseña *'),
        matching: find.byType(TextFormField),
      );
      final confirmField = find.ancestor(
        of: find.text('Confirmar contraseña *'),
        matching: find.byType(TextFormField),
      );
      expect(passField, findsOneWidget);
      expect(confirmField, findsOneWidget);
      expect(find.text('Crear mi cuenta'), findsWidgets);
    });

    testWidgets('modo con aprobación: texto del panel y envío de solicitud',
        (tester) async {
      TestHarness.prepare();
      MockApiClient.registrationConfig = const RegistrationConfig(
        mode: 'approval',
        autoApprove: false,
        message: 'Revisaremos su solicitud en 24 horas.',
      );

      await TestHarness.pumpApp(
        tester,
        overrides: <Override>[
          siteInfoProvider.overrideWith(
            (ref) async => SiteInfo.fromJson(<String, dynamic>{
              'registration': <String, dynamic>{
                'mode': 'approval',
                'autoApprove': false,
                'message': 'Revisaremos su solicitud en 24 horas.',
              },
            }),
          ),
        ],
      );
      await TestHarness.waitForBoot(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      await tester.tap(TestHarness.navTab('Perfil'), warnIfMissed: false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));
      await tester.tap(find.byKey(const Key('guest-register-button')).first);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      expect(find.text('Solicite su cuenta'), findsWidgets);
      expect(find.text('Revisaremos su solicitud en 24 horas.'), findsWidgets);

      // Los campos visibles al inicio del formulario.
      Future<void> escribir(String etiqueta, String valor) async {
        await tester.enterText(
          find.widgetWithText(TextFormField, etiqueta),
          valor,
        );
      }

      await escribir('Nombre completo *', 'María Fernández Solano');
      await escribir('Correo electrónico *', 'maria.fernandez@example.com');
      await escribir('Teléfono *', '+506 8888 8888');
      await escribir('Cédula / documento *', '1-1234-0567');

      // Contraseña: al final del formulario, hay que desplazarse.
      final scrollable = find.byType(Scrollable).last;
      for (int i = 0; i < 6; i++) {
        if (find.text('Contraseña *').evaluate().isNotEmpty) break;
        await tester.drag(scrollable, const Offset(0, -400));
        await TestHarness.advance(
          tester,
          duration: const Duration(milliseconds: 500),
        );
      }
      expect(
        find.text('Contraseña *'),
        findsWidgets,
        reason: 'El formulario debe incluir el campo de contraseña',
      );

      for (final etiqueta in <String>[
        'Contraseña *',
        'Confirmar contraseña *',
      ]) {
        await tester.enterText(
          find.ancestor(
            of: find.text(etiqueta),
            matching: find.byType(TextFormField),
          ),
          'Clave1234',
        );
      }
      await tester.pump();
      await TestHarness.advance(
        tester,
        duration: const Duration(milliseconds: 600),
      );

      await tester.tap(find.text('Enviar solicitud').last, warnIfMissed: false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 4));

      // Sigue sin sesión: la solicitud espera aprobación del administrador.
      final container = TestHarness.container(tester);
      expect(container.read(authProvider).isAuthenticated, isFalse);
      expect(
        find.textContaining('Estado de mi solicitud').evaluate().isNotEmpty ||
            find.textContaining('Progreso').evaluate().isNotEmpty ||
            find.textContaining('GH-SOL-').evaluate().isNotEmpty,
        isTrue,
        reason: 'Debe verse la pantalla de seguimiento con el código de trámite',
      );
    });
  });
}
