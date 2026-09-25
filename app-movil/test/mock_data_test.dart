import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/mock/mock_api_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('el modo demo carga el catálogo real desde el asset', () async {
    final client = MockApiClient();
    await client.init();
    final categories = await client.getCategories();
    final products = await client.getProducts(pageSize: 100);

    // ignore: avoid_print
    print('CATEGORIAS=${categories.length} PRODUCTOS=${products.total}');
    expect(categories, hasLength(4));
    expect(products.total, 62);
  });

  test('el asset está accesible por el bundle', () async {
    final raw = await rootBundle.loadString('assets/mock/catalog.seed.json');
    // ignore: avoid_print
    print('RAW_LEN=${raw.length}');
    expect(raw.length, greaterThan(1000));
  });
}
