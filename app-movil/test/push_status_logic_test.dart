import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/push/push_permission_service.dart';
import 'package:permission_handler/permission_handler.dart';

/// Android no expone «nunca se preguntó»: `denied` solo quiere decir que las
/// notificaciones no están activas. Si la app confundiera eso con «ya decidió»,
/// nunca pediría el permiso; si lo confundiera con «sin decidir», insistiría en
/// cada arranque. Estas pruebas fijan esa decisión.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Estado del permiso en Android', () {
    test('concedido se traduce como concedido', () {
      expect(
        resolveAndroidStatus(
          permission: PermissionStatus.granted,
          askedBefore: false,
        ),
        PushPermissionStatus.granted,
      );
      expect(
        resolveAndroidStatus(
          permission: PermissionStatus.granted,
          askedBefore: true,
        ),
        PushPermissionStatus.granted,
      );
    });

    test('provisional y limitado cuentan como concedido', () {
      for (final status in <PermissionStatus>[
        PermissionStatus.provisional,
        PermissionStatus.limited,
      ]) {
        expect(
          resolveAndroidStatus(permission: status, askedBefore: true),
          PushPermissionStatus.granted,
        );
      }
    });

    test('denegado sin haber preguntado todavía se puede proponer', () {
      expect(
        resolveAndroidStatus(
          permission: PermissionStatus.denied,
          askedBefore: false,
        ),
        PushPermissionStatus.notDetermined,
      );
    });

    test('denegado después de preguntar no vuelve a insistir', () {
      expect(
        resolveAndroidStatus(
          permission: PermissionStatus.denied,
          askedBefore: true,
        ),
        PushPermissionStatus.denied,
      );
    });

    test('bloqueado o restringido lleva a los ajustes', () {
      for (final status in <PermissionStatus>[
        PermissionStatus.permanentlyDenied,
        PermissionStatus.restricted,
      ]) {
        expect(
          resolveAndroidStatus(permission: status, askedBefore: true),
          PushPermissionStatus.permanentlyDenied,
        );
      }
    });
  });
}
