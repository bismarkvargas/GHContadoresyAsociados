import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/main.dart';

import 'helpers/test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('diag', (tester) async {
    TestHarness.prepare();
    await tester.pumpWidget(const ProviderScope(child: GhContadoresApp()));
    for (int i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 200));
      final texts = find
          .byType(Text)
          .evaluate()
          .map((e) => (e.widget as Text).data)
          .where((t) => t != null && t.isNotEmpty)
          .take(6)
          .join(' | ');
      debugPrint('[pump $i] ${tester.binding.transientCallbackCount} :: $texts');
    }
  });
}
