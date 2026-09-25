import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/widgets/gh_branding.dart';

import 'helpers/test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Arranque de la app (splash + onboarding)', () {
    testWidgets('muestra el splash con la marca GH y arranca la app',
        (tester) async {
      TestHarness.prepare();
      await TestHarness.pumpApp(tester);

      // El splash se pinta de inmediato con el monograma de marca.
      await tester.pump();
      expect(find.byType(GhLogo), findsWidgets);
      expect(find.text('GH Contadores'), findsWidgets);
      expect(
        find.text('En GH Contadores lo resolvemos por usted'),
        findsOneWidget,
      );

      // Y termina llevándonos al catálogo público (sin sesión).
      await TestHarness.waitForBoot(tester);
      expect(find.text('Servicios'), findsWidgets);
      expect(find.text('Buscar trámite, servicio o código…'), findsOneWidget);
    });

    testWidgets('sin onboarding completado abre las 3 diapositivas',
        (tester) async {
      TestHarness.prepare(onboardingDone: false);
      await TestHarness.pumpApp(tester);

      for (int i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 120));
        if (find.text('Tus trámites, bajo control').evaluate().isNotEmpty) break;
      }

      expect(find.text('Tus trámites, bajo control'), findsOneWidget);
      expect(find.text('Continuar'), findsOneWidget);
      expect(find.text('Solicitar una cuenta'), findsOneWidget);

      // Segunda diapositiva.
      await tester.tap(find.text('Continuar'));
      await tester.pumpAndSettle(const Duration(milliseconds: 400));
      expect(find.text('Firma legal y municipal'), findsOneWidget);
    });
  });
}
