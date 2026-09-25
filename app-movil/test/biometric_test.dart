import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/auth/biometric_service.dart';
import 'package:gh_contadores/core/error/api_failure.dart';
import 'package:gh_contadores/core/models/user.dart';
import 'package:gh_contadores/core/mock/mock_api_client.dart';
import 'package:gh_contadores/core/mock/mock_seed.dart';
import 'package:gh_contadores/core/network/api_client.dart';
import 'package:gh_contadores/core/providers/auth_provider.dart';
import 'package:gh_contadores/core/providers/biometric_provider.dart';
import 'package:gh_contadores/core/providers/core_providers.dart';
import 'package:gh_contadores/core/router/app_router.dart';
import 'package:gh_contadores/core/theme/gh_theme.dart';
import 'package:gh_contadores/features/auth/login_screen.dart';
import 'package:local_auth_platform_interface/local_auth_platform_interface.dart'
    show LocalAuthException, LocalAuthExceptionCode;
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_biometric.dart';
import 'helpers/test_harness.dart';

/// Cliente de API que delega en [MockApiClient] y solo cambia el refresco de
/// sesión: siempre responde «su refresh token ya no sirve», que es justo el
/// caso que obliga a volver a la contraseña y a desactivar la huella.
class _RefreshRejectingApiClient implements ApiClient {
  _RefreshRejectingApiClient(this._delegate);

  final MockApiClient _delegate;

  /// Doble del cliente real: el arranque lo reconoce y carga el catálogo del
  /// modo demo como con el cliente de verdad.
  MockApiClient get mock => _delegate;

  Future<void> init() => _delegate.init();

  @override
  Future<AuthSession> refresh(String refreshToken) {
    throw const ApiFailure(
      message: 'Tu sesión expiró. Inicia sesión nuevamente.',
      statusCode: 401,
      isUnauthorized: true,
    );
  }

  /// El resto de la API no se usa en el test: se delega solo lo que el flujo de
  /// acceso necesita (`init` para el catálogo semilla y `me` para validar la
  /// sesión restaurada).
  @override
  Future<AppUser> me() => _delegate.me();

  @override
  Future<AuthSession> login(
          {required String email, required String password}) =>
      _delegate.login(email: email, password: password);

  @override
  Future<void> logout(String refreshToken) => _delegate.logout(refreshToken);

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'El cliente de prueba no implementa ${invocation.memberName}',
    );
  }
}

/// Prepara preferencias + una biometría simulada concreta.
///
/// Se envuelve [TestHarness.prepare] para poder inyectar las claves de la huella
/// sin tocar el arnés compartido.
void prepareWithBiometrics({
  required bool supported,
  bool linked = false,
  String? ownerId,
  bool offered = true,
  bool loggedIn = false,
  String? sessionUserId,
  String label = 'su huella',
}) {
  TestHarness.prepare(loggedIn: loggedIn);
  SharedPreferences.setMockInitialValues(<String, Object>{
    'gh_onboarding_done': true,
    if (linked) kBiometricEnabledKey: true,
    if (linked) kBiometricOwnerKey: ownerId ?? MockSeed.demoUser().id,
    kBiometricOfferedKey: offered,
  });
  fakeBiometric = supported
      ? FakeBiometricService(label: label)
      : FakeBiometricService.unavailable();
}

/// Biometría simulada del test en curso.
late FakeBiometricService fakeBiometric;

/// Override que inyecta la biometría simulada en la app completa.
List<Override> biometricOverrides() => <Override>[
      biometricServiceProvider.overrideWithValue(fakeBiometric),
    ];

/// Monta la pantalla de login **sola**, con un contenedor de providers propio.
///
/// Se usa cuando la huella ya está vinculada: dentro de la app completa, abrir el
/// login dispara la entrada automática y la pantalla se desmonta antes de poder
/// comprobar el icono o el botón.
Future<ProviderContainer> pumpIsolatedLogin(WidgetTester tester) async {
  final container = ProviderContainer(overrides: biometricOverrides());
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: GhTheme.light(),
        home: const LoginScreen(),
      ),
    ),
  );
  await TestHarness.advance(tester, duration: const Duration(seconds: 1));
  return container;
}

/// Lleva la app a la pantalla de login (correo + contraseña).
///
/// Ojo: si la huella está vinculada a una cuenta con sesión guardada, abrir el
/// login dispara la **petición automática** de huella (una sola vez por visita).
Future<void> goToLogin(WidgetTester tester) async {
  TestHarness.container(tester).read(routerProvider).go(AppRoutes.login);
  await TestHarness.advance(tester, duration: const Duration(seconds: 1));
}

/// Cierra los avisos flotantes (SnackBar) para no tapar lo que viene después.
Future<void> clearSnackBars(WidgetTester tester) async {
  final messenger = find.byType(ScaffoldMessenger);
  if (messenger.evaluate().isNotEmpty) {
    tester.state<ScaffoldMessengerState>(messenger.first).clearSnackBars();
  }
  await TestHarness.advance(tester, duration: const Duration(seconds: 1));
}

/// Lee la marca persistida de «acceso con huella activado».
Future<bool> biometricFlagEnabled() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.reload();
  return prefs.getBool(kBiometricEnabledKey) ?? false;
}

/// Cuenta a la que está vinculada la huella, o `null` si no hay ninguna.
Future<String?> biometricOwner() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.reload();
  return prefs.getString(kBiometricOwnerKey);
}

/// ¿La app considera habilitada la huella? (estado en memoria del provider).
bool biometricProviderEnabled(WidgetTester tester) =>
    TestHarness.container(tester).read(biometricProvider).isEnabled;

/// Guarda una sesión (tokens + usuario) sin iniciar sesión en la app.
///
/// Es el caso real de «abro la app y no tengo sesión activa»: la huella vinculada
/// debe poder entrar con el *refresh token* guardado.
///
/// Con [expired] el access token ya venció, que es cuando de verdad hace falta el
/// *refresh token*.
Future<void> seedSession(
  WidgetTester tester, {
  String? userId,
  bool expired = false,
}) async {
  final container = TestHarness.container(tester);
  final store = container.read(tokenStoreProvider);
  await container.read(authProvider.notifier).forceLogout();
  await store.clear();
  await store.save(
    AuthSession(
      accessToken: 'biometric-access-token',
      refreshToken: 'biometric-refresh-token',
      expiresAt: DateTime.now().toUtc().add(
            expired ? const Duration(minutes: -5) : const Duration(hours: 1),
          ),
      user: userId == null
          ? MockSeed.demoUser()
          : MockSeed.demoUser().copyWith(email: '$userId@example.com'),
    ),
  );
  await TestHarness.advance(tester, duration: const Duration(seconds: 1));
  expect(
    container.read(authProvider).isAuthenticated,
    isFalse,
    reason: 'El arnés debe quedar sin sesión activa para probar el login',
  );
}

/// Espera a que aparezca el ofrecimiento de activar la huella.
Future<bool> waitForBiometricDialog(WidgetTester tester) async {
  for (int i = 0; i < 60; i++) {
    await tester.pump(const Duration(milliseconds: 120));
    if (find
        .byKey(const Key('biometric-enable-dialog'))
        .evaluate()
        .isNotEmpty) {
      return true;
    }
  }
  return false;
}

/// ¿Está el formulario normal de correo y contraseña a la vista?
void expectPasswordFormVisible() {
  expect(
    find.widgetWithText(TextFormField, 'Correo electrónico'),
    findsOneWidget,
    reason: 'Siempre debe quedar disponible el login con contraseña',
  );
  expect(
    find.widgetWithText(TextFormField, 'Contraseña'),
    findsOneWidget,
  );
  expect(find.widgetWithText(FilledButton, 'Iniciar sesión'), findsOneWidget);
}

/// Escribe la contraseña y pulsa «Iniciar sesión» (asegurando que se vea).
Future<void> submitLogin(WidgetTester tester,
    [String password = 'Demo1234']) async {
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Contraseña'),
    password,
  );
  await tester.pump();
  final entrar = find.widgetWithText(FilledButton, 'Iniciar sesión');
  await tester.ensureVisible(entrar);
  await tester.pump();
  await tester.tap(entrar, warnIfMissed: false);
  await TestHarness.advance(tester, duration: const Duration(seconds: 3));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Ofrecimiento y vinculación de la huella', () {
    testWidgets(
        'se ofrece tras iniciar sesión y vincula la huella a esa cuenta',
        (tester) async {
      // Cuenta nueva: sin huella vinculada y sin habérsele ofrecido todavía.
      prepareWithBiometrics(
          supported: true, offered: false, label: 'su huella');

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);

      // Invitado: nunca se le ofrece la huella (no hay cuenta que vincular).
      expect(find.byKey(const Key('biometric-enable-dialog')), findsNothing);

      await goToLogin(tester);
      await submitLogin(tester);

      expect(
        await waitForBiometricDialog(tester),
        isTrue,
        reason: 'Con lector y huellas registradas debe ofrecerse la huella',
      );
      expect(find.text('Activar acceso con huella'), findsOneWidget);
      expect(
          find.byKey(const Key('biometric-dialog-activate')), findsOneWidget);
      expect(find.byKey(const Key('biometric-dialog-later')), findsOneWidget);
      expect(find.text('Activar huella'), findsOneWidget);
      expect(find.text('Ahora no'), findsOneWidget);

      // Aceptar vincula la huella a la cuenta que acaba de iniciar sesión.
      await tester.tap(find.byKey(const Key('biometric-dialog-activate')));
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      expect(find.byKey(const Key('biometric-enable-dialog')), findsNothing);
      expect(
        fakeBiometric.authenticateCount,
        0,
        reason: 'Activar la huella no debe pedirla todavía',
      );
      expect(biometricProviderEnabled(tester), isTrue);
      await expectLater(biometricFlagEnabled(), completion(isTrue));
      await expectLater(
        biometricOwner(),
        completion(MockSeed.demoUser().id),
        reason: 'La huella queda vinculada a la cuenta que inició sesión',
      );
    });

    testWidgets('no se ofrece si el dispositivo no tiene biometría',
        (tester) async {
      prepareWithBiometrics(supported: false, offered: false);

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await goToLogin(tester);
      await submitLogin(tester);

      expect(
        await waitForBiometricDialog(tester),
        isFalse,
        reason: 'Sin sensor no debe ofrecerse la huella',
      );
      expect(find.byKey(const Key('biometric-enable-dialog')), findsNothing);
      expect(find.byKey(const Key('login-biometric-button')), findsNothing);
    });
  });

  group('Huella en el login', () {
    testWidgets('sin cuenta vinculada invita a habilitarla y no pide la huella',
        (tester) async {
      // Primera vez en el teléfono: hay lector, pero ninguna cuenta vinculada.
      prepareWithBiometrics(supported: true, offered: false);

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await goToLogin(tester);

      // El botón está a la vista, pero invita a vincular la huella.
      expect(find.byKey(const Key('login-biometric-button')), findsOneWidget);
      expect(find.text('Activar acceso con huella'), findsOneWidget);
      expect(
        biometricProviderEnabled(tester),
        isFalse,
        reason: 'Sin cuenta vinculada la huella no está habilitada',
      );

      await tester.tap(find.byKey(const Key('login-biometric-button')));
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      expect(
        fakeBiometric.authenticateCount,
        0,
        reason: 'No se pide la huella hasta vincularla con una cuenta',
      );
      expect(find.byKey(const Key('login-biometric-notice')), findsOneWidget);
      expect(find.textContaining('todavía no está activada'), findsOneWidget);
      expectPasswordFormVisible();
    });

    testWidgets('con la huella vinculada se muestra «Entrar con su huella»',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      final container = TestHarness.container(tester);
      // El provider consulta el dispositivo de forma asíncrona: se espera la
      // consulta para poder comprobar el estado real.
      await container.read(biometricProvider.notifier).refresh();
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));
      expect(
        container.read(biometricProvider).isEnabled,
        isTrue,
        reason: 'La huella está vinculada a la cuenta con sesión guardada',
      );
      expect(
        container.read(biometricProvider).canUseBiometrics,
        isTrue,
        reason: 'El dispositivo puede verificar la huella',
      );

      // El rótulo del botón es lógica pura: con vínculo entra directo y sin
      // vínculo invita a habilitarla.
      expect(
        biometricLoginLabel(enabled: true, deviceLabel: 'su huella'),
        'Entrar con su huella',
      );
      expect(
        biometricLoginLabel(enabled: false, deviceLabel: 'su huella'),
        'Activar acceso con huella',
        reason: 'Sin vínculo el botón invita a habilitarla',
      );
      expect(
        biometricLockReason(
          deviceReady: container.read(biometricProvider).status.isAvailable,
          enabled: container.read(biometricProvider).isEnabled,
          hasStoredSession: true,
          belongsToStoredUser: true,
        ),
        isNull,
        reason: 'Con la huella vinculada no hay motivo de bloqueo',
      );
    });

    testWidgets(
        'si el usuario la desvincula, el login invita a habilitarla otra vez',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);

      final notifier =
          TestHarness.container(tester).read(biometricProvider.notifier);
      await notifier.refresh();
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));
      expect(biometricProviderEnabled(tester), isTrue);

      // Se desvincula (como si el usuario lo apagara en el perfil).
      await notifier.setEnabled(false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));
      expect(biometricProviderEnabled(tester), isFalse);
      await expectLater(biometricFlagEnabled(), completion(isFalse));
      await expectLater(biometricOwner(), completion(isNull));
      expect(
        TestHarness.container(tester).read(biometricProvider).canUseBiometrics,
        isTrue,
        reason: 'El dispositivo sigue teniendo lector: la opción no desaparece',
      );
    });

    testWidgets('la huella de otra cuenta no abre esta sesión', (tester) async {
      // La sesión guardada es de otra persona distinta a la dueña de la huella.
      prepareWithBiometrics(
        supported: true,
        linked: true,
        ownerId: 'otra-cuenta',
        loggedIn: true,
      );

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);

      final notifier =
          TestHarness.container(tester).read(biometricProvider.notifier);
      await notifier.refresh();
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));

      expect(
        biometricProviderEnabled(tester),
        isFalse,
        reason: 'La huella de otra cuenta no sirve para esta sesión',
      );
      await expectLater(
        biometricOwner(),
        completion(isNull),
        reason:
            'Se limpia el vínculo ajeno para poder ofrecérsela al usuario actual',
      );
    });

    testWidgets(
        'se desvincula con aviso suave si el dispositivo pierde la huella',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);
      final container = ProviderContainer(overrides: biometricOverrides());
      addTearDown(container.dispose);
      final notifier = container.read(biometricProvider.notifier);

      await notifier.refresh();
      expect(container.read(biometricProvider).isEnabled, isTrue);

      // El dispositivo se queda sin huellas utilizables (se borraron del
      // sistema, el sensor dejó de responder…).
      fakeBiometric.setAvailability(BiometricAvailability.unavailable);
      await notifier.refresh();
      await tester.pump();

      final state = container.read(biometricProvider);
      expect(state.isEnabled, isFalse, reason: 'Debe desvincularse sola');
      expect(state.notice, kBiometricUnavailableNotice);
      expect(state.canUseBiometrics, isFalse);
      await expectLater(biometricFlagEnabled(), completion(isFalse));
      await expectLater(biometricOwner(), completion(isNull));
    });
  });

  group('Entrar con la huella', () {
    testWidgets('un fallo de autenticación cae al login normal con contraseña',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);
      fakeBiometric.nextResult =
          const BiometricResult.failed(BiometricFailure.notRecognized);

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await seedSession(tester);
      // Abrir el login pide la huella automáticamente: con el fallo simulado se
      // debe quedar en el formulario de correo y contraseña.
      await goToLogin(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      expect(
        fakeBiometric.authenticateCount,
        1,
        reason: 'La petición automática se hace una sola vez por visita',
      );
      expect(
        find.textContaining('No pudimos verificar su huella'),
        findsWidgets,
      );
      expect(find.text(kBiometricNotRecognizedMessage), findsOneWidget);
      expect(find.byKey(const Key('login-biometric-retry')), findsOneWidget);

      // El reintento vuelve a pedir la huella (y esta vez entra).
      fakeBiometric.nextResult = const BiometricResult.ok();
      await tester.tap(find.byKey(const Key('login-biometric-retry')));
      await TestHarness.advance(tester, duration: const Duration(seconds: 3));
      expect(fakeBiometric.authenticateCount, 2);
      expect(
        find.byKey(const Key('login-biometric-button')),
        findsNothing,
        reason: 'Al verificar la huella debe entrar al inicio',
      );
    });

    testWidgets('con la huella vinculada entra sin escribir la contraseña',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await seedSession(tester);
      await goToLogin(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 3));

      expect(fakeBiometric.authenticateCount, 1);
      expect(
        fakeBiometric.lastReason,
        biometricReasonFor(fakeBiometric.label),
        reason: 'El texto del diálogo del sistema debe ser el de la firma',
      );
      expect(
        find.byKey(const Key('login-biometric-button')),
        findsNothing,
        reason: 'Al entrar debe abandonar el login',
      );
      expect(
        TestHarness.container(tester).read(authProvider).isAuthenticated,
        isTrue,
        reason: 'La sesión se restauró con el refresh token guardado',
      );
    });

    testWidgets('desde el login se puede entrar con correo y contraseña',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);
      // La huella no se reconoce: la salida es el formulario normal.
      fakeBiometric.nextResult =
          const BiometricResult.failed(BiometricFailure.notRecognized);

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await seedSession(tester);
      await goToLogin(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      expect(fakeBiometric.authenticateCount, 1);
      expectPasswordFormVisible();

      await submitLogin(tester);
      expect(
        TestHarness.container(tester).read(authProvider).isAuthenticated,
        isTrue,
        reason: 'La contraseña siempre es una salida válida',
      );
    });

    testWidgets('cancelar la huella no muestra errores y sigue en el login',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);
      fakeBiometric.cancelNext();

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await seedSession(tester);
      await goToLogin(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      expect(fakeBiometric.authenticateCount, 1);
      expect(find.byKey(const Key('login-biometric-notice')), findsNothing);
      expect(find.textContaining('No pudimos verificar'), findsNothing);
      expectPasswordFormVisible();
      expect(
        biometricFlagEnabled(),
        completion(isTrue),
        reason: 'Cancelar no debe desvincular la huella',
      );
      await expectLater(biometricOwner(), completion(MockSeed.demoUser().id));

      // No hay bucle: pasan los segundos y no se vuelve a pedir.
      await TestHarness.advance(tester, duration: const Duration(seconds: 4));
      expect(fakeBiometric.authenticateCount, 1);
    });

    testWidgets('un error del plugin también cae al login normal',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);
      fakeBiometric.authError = PlatformException(
        code: 'NotEnrolled',
        message: 'No hay huellas registradas',
      );

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await seedSession(tester);
      await goToLogin(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      expect(fakeBiometric.authenticateCount, 1);
      expect(find.byKey(const Key('login-biometric-notice')), findsOneWidget);
      expectPasswordFormVisible();
    });

    testWidgets(
        'un refresh token caducado pide la contraseña y desvincula la huella',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);

      final client = _RefreshRejectingApiClient(MockApiClient());
      await client.init();
      await client.login(
        email: MockSeed.demoUser().email,
        password: MockSeed.demoPassword,
      );
      await client.me(); // deja la sesión del modo demo lista

      await TestHarness.pumpApp(
        tester,
        overrides: <Override>[
          ...biometricOverrides(),
          apiClientProvider.overrideWithValue(client),
        ],
      );
      await TestHarness.waitForBoot(tester);
      // La huella debe entrar con la sesión guardada, que ya está vencida.
      await seedSession(tester, expired: true);
      await goToLogin(tester);
      await TestHarness.advance(tester, duration: const Duration(seconds: 3));
      // El cierre de sesión reconstruye el router y go_router reubica el
      // navegador del shell: es un aviso ya conocido del framework, no un fallo
      // del flujo.
      tester.takeException();

      expect(fakeBiometric.authenticateCount, 1);
      final biometric = TestHarness.container(tester).read(biometricProvider);
      expect(biometric.notice, kBiometricSessionExpiredNotice);
      expect(biometricProviderEnabled(tester), isFalse);
      await expectLater(
        biometricFlagEnabled(),
        completion(isFalse),
        reason: 'Un refresh token caducado desvincula la huella',
      );
      await expectLater(biometricOwner(), completion(isNull));
      expect(find.byKey(const Key('login-biometric-button')), findsNothing);
    });
  });

  group('Interruptor del perfil', () {
    /// Baja hasta la fila de la huella dentro del perfil.
    Future<void> scrollToToggle(WidgetTester tester) async {
      final toggle = find.byKey(const Key('profile-biometric-toggle'));
      for (int i = 0; i < 8 && toggle.evaluate().isEmpty; i++) {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -300));
        await TestHarness.advance(
          tester,
          duration: const Duration(milliseconds: 500),
        );
      }
    }

    testWidgets('sin biometría queda deshabilitado con el motivo',
        (tester) async {
      prepareWithBiometrics(supported: false, loggedIn: true);

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await tester.tap(TestHarness.navTab('Perfil'), warnIfMissed: false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));
      await scrollToToggle(tester);

      final toggle = find.byKey(const Key('profile-biometric-toggle'));
      expect(toggle, findsOneWidget);
      expect(find.text('Acceso con huella'), findsOneWidget);

      final tile = tester.widget<SwitchListTile>(toggle);
      expect(tile.value, isFalse);
      expect(
        tile.onChanged,
        isNull,
        reason: 'Sin lector la fila debe quedar deshabilitada',
      );
      expect(
        find.textContaining('no tiene lector de huellas'),
        findsOneWidget,
        reason: 'El subtítulo explica el motivo',
      );
    });

    testWidgets('con biometría refleja el estado y se puede activar',
        (tester) async {
      prepareWithBiometrics(supported: true, linked: true, loggedIn: true);

      await TestHarness.pumpApp(tester, overrides: biometricOverrides());
      await TestHarness.waitForBoot(tester);
      await tester.tap(TestHarness.navTab('Perfil'), warnIfMissed: false);
      await TestHarness.advance(tester, duration: const Duration(seconds: 1));
      await scrollToToggle(tester);

      final toggle = find.byKey(const Key('profile-biometric-toggle'));
      expect(toggle, findsOneWidget);

      // La huella está vinculada a la cuenta con sesión: aparece activada.
      var tile = tester.widget<SwitchListTile>(toggle);
      expect(tile.value, isTrue, reason: 'Refleja el estado real');
      expect(tile.onChanged, isNotNull, reason: 'Con lector debe poder usarse');
      expect(find.textContaining('Activado en este dispositivo'), findsWidgets);

      // Se desvincula desde el perfil y la decisión persiste.
      await tester.tap(toggle);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      tile = tester.widget<SwitchListTile>(toggle);
      expect(tile.value, isFalse, reason: 'Debe reflejar el estado real');
      await expectLater(biometricFlagEnabled(), completion(isFalse));
      await expectLater(biometricOwner(), completion(isNull));

      // Y se puede volver a vincular (se retira el aviso que tapa la fila).
      await clearSnackBars(tester);
      await tester.tap(toggle);
      await TestHarness.advance(tester, duration: const Duration(seconds: 2));

      tile = tester.widget<SwitchListTile>(toggle);
      expect(tile.value, isTrue);
      await expectLater(biometricFlagEnabled(), completion(isTrue));
      await expectLater(biometricOwner(), completion(MockSeed.demoUser().id));
    });
  });

  group('Reglas puras del acceso con huella', () {
    test('el estado se resuelve con soporte y huellas registradas', () {
      expect(
        resolveBiometricStatus(supported: false, enrolled: false).availability,
        BiometricAvailability.unavailable,
      );
      expect(
        resolveBiometricStatus(supported: true, enrolled: false).availability,
        BiometricAvailability.notEnrolled,
      );
      expect(
        resolveBiometricStatus(supported: true, enrolled: true).isAvailable,
        isTrue,
      );
    });

    test('la huella solo sirve si está vinculada a la cuenta guardada', () {
      // Sin sesión guardada: hay que invitar a vincularla.
      expect(
        biometricLockReason(
          deviceReady: true,
          enabled: false,
          hasStoredSession: false,
          belongsToStoredUser: false,
        ),
        kBiometricLinkMessage,
      );
      // Sesión guardada pero sin vínculo para ella: se le invita a habilitarla.
      expect(
        biometricLockReason(
          deviceReady: true,
          enabled: true,
          hasStoredSession: true,
          belongsToStoredUser: false,
        ),
        contains('Inicie sesión'),
      );
      // Vinculada a la cuenta con sesión: todo listo.
      expect(
        biometricLockReason(
          deviceReady: true,
          enabled: true,
          hasStoredSession: true,
          belongsToStoredUser: true,
        ),
        isNull,
      );
      // Sin lector no hay nada que explicar aquí.
      expect(
        biometricLockReason(
          deviceReady: false,
          enabled: false,
          hasStoredSession: true,
          belongsToStoredUser: false,
        ),
        isNull,
      );
    });

    test('las excepciones se clasifican según lo que debe hacer la app', () {
      expect(
        classifyBiometricError(
          const LocalAuthException(code: LocalAuthExceptionCode.userCanceled),
        ),
        BiometricFailure.canceled,
      );
      expect(
        classifyBiometricError(
          const LocalAuthException(
            code: LocalAuthExceptionCode.noBiometricsEnrolled,
          ),
        ),
        BiometricFailure.noCredentials,
      );
      expect(
        classifyBiometricError(
          const LocalAuthException(code: LocalAuthExceptionCode.deviceError),
        ),
        BiometricFailure.notRecognized,
      );
      expect(
        classifyBiometricError(
          PlatformException(code: 'NotAvailable'),
        ),
        BiometricFailure.unavailable,
      );
    });

    test('la sesión guardada se renueva cuando el token está por vencer', () {
      expect(sessionNeedsRefresh(null), isTrue);
      expect(
        sessionNeedsRefresh(
          DateTime.now().toUtc().add(const Duration(minutes: 1)),
        ),
        isTrue,
      );
      expect(
        sessionNeedsRefresh(
          DateTime.now().toUtc().add(const Duration(hours: 2)),
        ),
        isFalse,
      );
    });

    test('la cancelación no genera mensaje y el fallo sí', () {
      expect(messageForFailure(BiometricFailure.canceled), isNull);
      expect(
        messageForFailure(BiometricFailure.notRecognized),
        kBiometricNotRecognizedMessage,
      );
    });
  });
}
