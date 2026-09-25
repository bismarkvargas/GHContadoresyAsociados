import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/widgets/gh_logo.dart';

import 'helpers/test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Arranque de la app (splash + onboarding)', () {
    testWidgets('muestra el splash con la marca GH y arranca en el catálogo',
        (tester) async {
      TestHarness.prepare();
      await TestHarness.pumpApp(tester);

      // El splash se pinta de inmediato con la marca y la franja lima.
      await tester.pump();
      expect(find.byType(GhLogoImage), findsWidgets);
      expect(find.byType(GhTopStripe), findsWidgets);
      expect(find.text('GH Contadores y Asociados'), findsWidgets);
      expect(
        find.text('En GH Contadores lo resolvemos por usted'),
        findsOneWidget,
      );

      // Y termina llevándonos al catálogo público (sin sesión).
      await TestHarness.waitForBoot(tester);
      expect(find.text('Servicios'), findsWidgets);
      expect(find.textContaining('Buscar'), findsWidgets);

      await TestHarness.teardown(tester);
    });

    testWidgets('sin onboarding completado abre las diapositivas de bienvenida',
        (tester) async {
      TestHarness.prepare(onboardingDone: false);
      await TestHarness.pumpApp(tester);

      final found = await TestHarness.waitForText(
        tester,
        'Tus trámites, bajo control',
      );
      expect(
        found,
        isTrue,
        reason: 'El onboarding debe mostrarse cuando no está completado',
      );
      expect(find.text('Continuar'), findsOneWidget);
      expect(find.text('Solicitar una cuenta'), findsOneWidget);

      // Avanza a la segunda diapositiva.
      await tester.tap(find.text('Continuar'));
      await TestHarness.advance(
        tester,
        duration: const Duration(milliseconds: 900),
      );
      expect(find.text('Firma legal y municipal'), findsOneWidget);

      await TestHarness.teardown(tester);
    });
  });
}
