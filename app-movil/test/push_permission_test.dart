import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/providers/push_permission_provider.dart';
import 'package:gh_contadores/core/push/push_permission_service.dart';

import 'helpers/test_harness.dart';

/// El permiso de notificaciones es lo que hace posible el push: sin él, Android
/// 13+ descarta las notificaciones del servidor. Estos tests comprueban que la
/// app lo pide en el momento adecuado, con contexto, y solo una vez.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Espera a que aparezca el aviso (se muestra 400 ms después del login).
  Future<bool> waitForDialog(WidgetTester tester) async {
    for (int i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      if (find.byKey(const Key('push-permission-dialog')).evaluate().isNotEmpty) {
        return true;
      }
    }
    return false;
  }

  group('Permiso de notificaciones push', () {
    testWidgets('el aviso aparece tras iniciar sesión si no está concedido',
        (tester) async {
      TestHarness.prepare();
      TestHarness.fakePush.setStatus(PushPermissionStatus.notDetermined);

      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);

      // Sin sesión no se pide nada (no tendría trámites que seguir).
      expect(
        find.byKey(const Key('push-permission-dialog')),
        findsNothing,
        reason: 'No debe pedirse el permiso a un invitado',
      );
      expect(TestHarness.fakePush.requestCount, 0);

      // Al iniciar sesión aparece el aviso con marca.
      await TestHarness.loginAsDemoUser(tester);
      final shown = await waitForDialog(tester);
      expect(shown, isTrue, reason: 'Debe ofrecerse activar las notificaciones');
      expect(find.text('Active las notificaciones'), findsOneWidget);
      expect(
        find.textContaining('cuando su expediente avance'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('push-dialog-activate')), findsOneWidget);
      expect(find.byKey(const Key('push-dialog-later')), findsOneWidget);
      // El diálogo del sistema todavía no se ha pedido.
      expect(TestHarness.fakePush.requestCount, 0);

      // El aviso se mantiene abierto mientras se deja correr el reloj (así no
      // queda pendiente el temporizador del SnackBar de bienvenida).
      await TestHarness.advance(tester, duration: const Duration(seconds: 5));
      expect(find.byKey(const Key('push-permission-dialog')), findsOneWidget);
    });

    testWidgets('al pulsar «Activar» se pide el permiso y se registra el token',
        (tester) async {
      TestHarness.prepare();
      TestHarness.fakePush.setStatus(PushPermissionStatus.notDetermined);
      TestHarness.fakePush.nextRequestResult = PushPermissionStatus.granted;

      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);
      await TestHarness.loginAsDemoUser(tester);
      expect(await waitForDialog(tester), isTrue);

      await tester.tap(find.byKey(const Key('push-dialog-activate')));
      await TestHarness.advance(tester, duration: const Duration(seconds: 3));

      // Se pidió el permiso del sistema y se registró el token en la API.
      expect(TestHarness.fakePush.requestCount, 1);
      expect(TestHarness.fakePush.registerTokenCount, greaterThanOrEqualTo(1));
      expect(TestHarness.fakePush.registeredTokens, contains('fake-fcm-token'));

      // Se avisa de que quedó activado y el diálogo se cierra.
      expect(
        find.textContaining('Notificaciones activadas'),
        findsWidgets,
      );
      expect(find.byKey(const Key('push-permission-dialog')), findsNothing);

      // El estado del permiso refleja la concesión.
      final status = TestHarness.container(tester)
          .read(pushPermissionProvider)
          .value;
      expect(status, PushPermissionStatus.granted);
    });

    testWidgets('«Ahora no» descarta el aviso y no vuelve a insistir',
        (tester) async {
      TestHarness.prepare();
      TestHarness.fakePush.setStatus(PushPermissionStatus.notDetermined);

      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);
      await TestHarness.loginAsDemoUser(tester);
      expect(await waitForDialog(tester), isTrue);

      await tester.tap(find.byKey(const Key('push-dialog-later')));
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      // No se pidió el permiso del sistema (se reserva para más adelante).
      expect(TestHarness.fakePush.requestCount, 0);
      expect(find.byKey(const Key('push-permission-dialog')), findsNothing);
      // Queda marcado para no volver a insistir.
      expect(
        TestHarness.container(tester).read(pushAskedProvider),
        isTrue,
        reason: 'No debe volver a proponerse en la misma sesión',
      );

      // Y no reaparece tras navegar por la app.
      await tester.tap(TestHarness.navTab('Servicios'), warnIfMissed: false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));
      expect(find.byKey(const Key('push-permission-dialog')), findsNothing);
    });

    testWidgets('si el permiso ya está concedido no se muestra el aviso',
        (tester) async {
      TestHarness.prepare(loggedIn: true);
      TestHarness.fakePush.setStatus(PushPermissionStatus.granted);

      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      expect(find.byKey(const Key('push-permission-dialog')), findsNothing);
      // Con permiso ya concedido se asegura el token sin molestar al usuario.
      expect(TestHarness.fakePush.registerTokenCount, greaterThanOrEqualTo(1));
    });

    testWidgets('el perfil refleja el estado y permite activarlas',
        (tester) async {
      TestHarness.prepare(loggedIn: true);
      TestHarness.fakePush.setStatus(PushPermissionStatus.denied);
      TestHarness.fakePush.nextRequestResult = PushPermissionStatus.granted;

      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      // Ir a Mi cuenta.
      await tester.tap(TestHarness.navTab('Perfil'), warnIfMissed: false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      // El interruptor existe y está apagado mientras el permiso está denegado.
      final toggle = find.byKey(const Key('profile-push-toggle'));
      for (int i = 0; i < 6 && toggle.evaluate().isEmpty; i++) {
        await tester.drag(
          find.byType(Scrollable).first,
          const Offset(0, -300),
        );
        await TestHarness.advance(
          tester,
          duration: const Duration(milliseconds: 500),
        );
      }
      expect(toggle, findsOneWidget);
      expect(find.text('Notificaciones push'), findsWidgets);
      expect(find.textContaining('Desactivadas'), findsWidgets);

      final switchWidget = tester.widget<SwitchListTile>(toggle);
      expect(switchWidget.value, isFalse);

      // Al encenderlo se pide el permiso y queda concedido.
      await tester.tap(toggle);
      await TestHarness.advance(tester, duration: const Duration(seconds: 3));

      expect(TestHarness.fakePush.requestCount, 1);
      final status = TestHarness.container(tester)
          .read(pushPermissionProvider)
          .value;
      expect(status, PushPermissionStatus.granted);
      expect(
        tester
            .widget<SwitchListTile>(find.byKey(const Key('profile-push-toggle')))
            .value,
        isTrue,
        reason: 'El interruptor debe reflejar el estado real concedido',
      );
    });

    testWidgets('la bandeja de Notificaciones avisa si están desactivadas',
        (tester) async {
      TestHarness.prepare(loggedIn: true);
      TestHarness.fakePush.setStatus(PushPermissionStatus.denied);

      await TestHarness.pumpApp(tester);
      await TestHarness.waitForBoot(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      // Acceso rápido del inicio → bandeja de notificaciones.
      final acceso = find.text('Notificaciones');
      expect(acceso, findsWidgets);
      await tester.tap(acceso.first, warnIfMissed: false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      // La tarjeta de aviso queda arriba del listado, con acción.
      expect(find.byKey(const Key('push-disabled-notice')), findsOneWidget);
      expect(
        find.text('Las notificaciones están desactivadas'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('push-notice-activate')), findsOneWidget);

      // Al pulsar se pide el permiso (estaba denegado, aún puede pedirse).
      TestHarness.fakePush.nextRequestResult = PushPermissionStatus.granted;
      await tester.tap(find.byKey(const Key('push-notice-activate')));
      await TestHarness.advance(tester, duration: const Duration(seconds: 3));
      expect(TestHarness.fakePush.requestCount, 1);
    });
  });
}
