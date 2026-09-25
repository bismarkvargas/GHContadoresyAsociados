import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../models/catalog.dart';
import '../models/user.dart';
import '../utils/json.dart';
import 'core_providers.dart';

/// Filtros activos del catálogo.
class CatalogFilters {
  const CatalogFilters({
    this.categorySlug,
    this.search = '',
    this.sort = 'featured',
    this.minPrice,
    this.maxPrice,
    this.featuredOnly = false,
  });

  final String? categorySlug;
  final String search;
  final String sort; // featured | price | name
  final double? minPrice;
  final double? maxPrice;
  final bool featuredOnly;

  bool get hasActiveFilters =>
      (categorySlug != null && categorySlug!.isNotEmpty) ||
      search.trim().isNotEmpty ||
      minPrice != null ||
      maxPrice != null ||
      featuredOnly;

  int get activeFilterCount {
    int count = 0;
    if (categorySlug != null && categorySlug!.isNotEmpty) count++;
    if (minPrice != null || maxPrice != null) count++;
    if (featuredOnly) count++;
    return count;
  }

  CatalogFilters copyWith({
    String? categorySlug,
    String? search,
    String? sort,
    double? minPrice,
    double? maxPrice,
    bool? featuredOnly,
    bool clearCategory = false,
    bool clearPrice = false,
  }) =>
      CatalogFilters(
        categorySlug: clearCategory ? null : (categorySlug ?? this.categorySlug),
        search: search ?? this.search,
        sort: sort ?? this.sort,
        minPrice: clearPrice ? null : (minPrice ?? this.minPrice),
        maxPrice: clearPrice ? null : (maxPrice ?? this.maxPrice),
        featuredOnly: featuredOnly ?? this.featuredOnly,
      );
}

final catalogFiltersProvider =
    StateProvider<CatalogFilters>((ref) => const CatalogFilters());

/// Catálogo paginado con scroll infinito.
class CatalogState {
  const CatalogState({
    this.products = const <Product>[],
    this.page = 0,
    this.totalPages = 1,
    this.total = 0,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.hasMore = true,
  });

  final List<Product> products;
  final int page;
  final int totalPages;
  final int total;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;
  final bool hasMore;

  CatalogState copyWith({
    List<Product>? products,
    int? page,
    int? totalPages,
    int? total,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    bool? hasMore,
    bool clearError = false,
  }) =>
      CatalogState(
        products: products ?? this.products,
        page: page ?? this.page,
        totalPages: totalPages ?? this.totalPages,
        total: total ?? this.total,
        isLoading: isLoading ?? this.isLoading,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        error: clearError ? null : (error ?? this.error),
        hasMore: hasMore ?? this.hasMore,
      );
}

class CatalogNotifier extends StateNotifier<CatalogState> {
  CatalogNotifier(this._ref) : super(const CatalogState());

  final Ref _ref;

  CatalogFilters get _filters => _ref.read(catalogFiltersProvider);

  Future<void> refresh() => _load(reset: true);

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore || state.isLoading) return;
    await _load(reset: false);
  }

  Future<void> _load({required bool reset}) async {
    final filters = _filters;
    state = reset
        ? state.copyWith(isLoading: true, clearError: true, products: <Product>[])
        : state.copyWith(isLoadingMore: true, clearError: true);

    try {
      final client = await _ref.read(apiBootstrapProvider.future);
      if (!mounted) return;
      final page = reset ? 1 : state.page + 1;
      final result = await client.getProducts(
        category: filters.categorySlug,
        search: filters.search.trim().isEmpty ? null : filters.search.trim(),
        featured: filters.featuredOnly ? true : null,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        sort: _apiSort(filters.sort),
        order: filters.sort == 'price' ? 'asc' : 'asc',
        page: page,
        pageSize: AppConfig.pageSize,
      );
      if (!mounted) return;
      state = CatalogState(
        products: reset ? result.items : <Product>[...state.products, ...result.items],
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
        hasMore: result.hasMore,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        isLoadingMore: false,
        error: e.toString().replaceFirst('ApiFailure', '').trim(),
        hasMore: state.products.isNotEmpty,
      );
    }
  }

  static String _apiSort(String sort) {
    switch (sort) {
      case 'price':
        return 'price';
      case 'name':
        return 'name';
      default:
        return 'featured';
    }
  }
}

final catalogProvider =
    StateNotifierProvider<CatalogNotifier, CatalogState>((ref) {
  final notifier = CatalogNotifier(ref);
  ref.listen<CatalogFilters>(catalogFiltersProvider, (previous, next) {
    notifier.refresh();
  });
  return notifier;
});

/// Servicios destacados para el home.
final featuredProductsProvider = FutureProvider<List<Product>>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getProducts(featured: true, pageSize: 8);
  if (result.items.isNotEmpty) return result.items;
  final fallback = await client.getProducts(pageSize: 8);
  return fallback.items;
});

/// Búsqueda directa (usada por el buscador del home).
final productSearchProvider =
    FutureProvider.family<List<Product>, String>((ref, query) async {
  if (query.trim().length < 2) return const <Product>[];
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.searchProducts(query, pageSize: 20);
  return result.items;
});

/// Ficha de servicio por slug, con relacionados.
final productDetailProvider =
    FutureProvider.family<({Product product, List<Product> related}), String>(
        (ref, slug) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  return client.getProduct(slug);
});

/// Nombres de categoría indexados por slug (para etiquetas y filtros).
final categoryBySlugProvider = FutureProvider<Map<String, ProductCategory>>(
  (ref) async {
    final list = await ref.watch(categoriesProvider.future);
    return <String, ProductCategory>{
      for (final c in list) c.slug: c,
    };
  },
);

/// Tipos de cliente para el formulario de solicitud de cuenta.
const List<ClientType> clientTypeOptions = <ClientType>[
  ClientType.individual,
  ClientType.company,
  ClientType.foreignInvestor,
];

/// Rango de precios del catálogo real (mín. 16,95 · máx. 960,50 USD).
final catalogPriceBoundsProvider = FutureProvider<({double min, double max})>(
  (ref) async {
    final client = await ref.watch(apiBootstrapProvider.future);
    final all = await client.getProducts(pageSize: 500);
    if (all.items.isEmpty) return (min: 0.0, max: 1000.0);
    double min = all.items.first.price;
    double max = all.items.first.price;
    for (final p in all.items) {
      if (p.price < min) min = p.price;
      if (p.price > max) max = p.price;
    }
    return (min: min, max: max);
  },
);

/// Utilidad: convierte una lista de mapas JSON en productos (dashboard).
List<Product> productsFromJsonList(List<JsonMap> list) =>
    list.map(Product.fromJson).toList();
