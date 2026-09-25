import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/catalog.dart';
import '../../core/providers/catalog_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/async_guard.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/gh_branding.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';
import '../../core/widgets/product_card.dart';

/// Tienda de servicios: 4 categorías reales, buscador con filtros y orden,
/// grilla con precio en USD y paginación infinita.
class CatalogScreen extends ConsumerStatefulWidget {
  const CatalogScreen({super.key});

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchController = TextEditingController();
  final Debouncer _debouncer = Debouncer();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Carga inicial del catálogo (paginación infinita).
      ref.read(catalogProvider.notifier).refresh();
    });
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
    _debouncer.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 400) {
      ref.read(catalogProvider.notifier).loadMore();
    }
  }

  void _onSearchChanged(String value) {
    _debouncer.run(() {
      final current = ref.read(catalogFiltersProvider);
      ref.read(catalogFiltersProvider.notifier).state =
          current.copyWith(search: value);
    });
  }

  Future<void> _openFilters() async {
    final filters = ref.read(catalogFiltersProvider);
    final bounds = await ref.read(catalogPriceBoundsProvider.future);

    if (!mounted) return;
    final result = await showModalBottomSheet<CatalogFilters>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _FilterSheet(
        filters: filters,
        minBounds: bounds.min,
        maxBounds: bounds.max,
      ),
    );
    if (result != null) {
      ref.read(catalogFiltersProvider.notifier).state = result;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final filters = ref.watch(catalogFiltersProvider);
    final catalog = ref.watch(catalogProvider);
    final categories = ref.watch(categoriesProvider);
    final useMocks = ref.watch(useMocksProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Servicios'),
        actions: <Widget>[
          IconButton(
            onPressed: _openFilters,
            tooltip: 'Filtros y orden',
            icon: Badge(
              isLabelVisible: filters.activeFilterCount > 0,
              label: Text('${filters.activeFilterCount}'),
              child: const Icon(Icons.tune_rounded),
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(108),
          child: Column(
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  onChanged: _onSearchChanged,
                  decoration: InputDecoration(
                    hintText: 'Buscar trámite, servicio o código…',
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: _searchController.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Limpiar búsqueda',
                            onPressed: () {
                              _searchController.clear();
                              _onSearchChanged('');
                              setState(() {});
                            },
                            icon: const Icon(Icons.close_rounded),
                          ),
                  ),
                ),
              ),
              SizedBox(
                height: 46,
                child: categories.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: <Widget>[
                        ShimmerBox(width: 120, height: 34, radius: 17),
                        SizedBox(width: 8),
                        ShimmerBox(width: 100, height: 34, radius: 17),
                      ],
                    ),
                  ),
                  error: (error, _) => const SizedBox.shrink(),
                  data: (list) => ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: <Widget>[
                      _CategoryChip(
                        label: 'Todos',
                        count: catalog.total,
                        selected: filters.categorySlug == null,
                        onTap: () {
                          final current = ref.read(catalogFiltersProvider);
                          ref.read(catalogFiltersProvider.notifier).state =
                              current.copyWith(clearCategory: true);
                        },
                      ),
                      for (final category in list)
                        _CategoryChip(
                          label: category.name,
                          count: category.productCount,
                          icon: category.icon,
                          selected: filters.categorySlug == category.slug,
                          onTap: () {
                            final current = ref.read(catalogFiltersProvider);
                            ref.read(catalogFiltersProvider.notifier).state =
                                current.copyWith(categorySlug: category.slug);
                          },
                        ),
                    ],
                  ),
                ),
              ),
              if (useMocks)
                const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: GhDemoChip(label: 'Catálogo real · 62 servicios'),
                ),
            ],
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(catalogProvider.notifier).refresh(),
        child: _buildBody(context, catalog, filters, theme),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    CatalogState catalog,
    CatalogFilters filters,
    ThemeData theme,
  ) {
    if (catalog.isLoading && catalog.products.isEmpty) {
      return const ProductGridSkeleton(count: 6);
    }

    if (catalog.error != null && catalog.products.isEmpty) {
      return GhErrorState(
        message: catalog.error!,
        onRetry: () => ref.read(catalogProvider.notifier).refresh(),
      );
    }

    if (catalog.products.isEmpty) {
      return GhEmptyState(
        title: 'Sin resultados',
        message: filters.search.isNotEmpty
            ? 'No encontramos servicios para «${filters.search}». Prueba con otra palabra.'
            : 'No hay servicios en esta categoría por ahora.',
        illustration: GhIllustration.search,
        actionLabel: 'Limpiar filtros',
        onAction: () {
          _searchController.clear();
          ref.read(catalogFiltersProvider.notifier).state = const CatalogFilters();
        },
      );
    }

    return CustomScrollView(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: <Widget>[
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              children: <Widget>[
                Text(
                  '${catalog.total} servicios',
                  style: theme.textTheme.labelMedium,
                ),
                const SizedBox(width: 8),
                if (filters.sort != 'featured')
                  Text(
                    filters.sort == 'price' ? '· precio ↑' : '· nombre A-Z',
                    style: theme.textTheme.bodySmall,
                  ),
                const Spacer(),
                Text(
                  'Desde ${GhFormat.money(_minPrice(catalog.products))}',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 0.66,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) => ProductCard(product: catalog.products[index]),
              childCount: catalog.products.length,
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: GhLoadMoreFooter(
            isLoading: catalog.isLoadingMore,
            hasMore: catalog.hasMore,
            endLabel: 'Mostrando los ${catalog.products.length} servicios',
          ),
        ),
      ],
    );
  }

  double _minPrice(List<Product> products) {
    if (products.isEmpty) return 0;
    double min = products.first.price;
    for (final p in products) {
      if (p.price < min) min = p.price;
    }
    return min;
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.count,
    this.icon,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final int? count;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Semantics(
        selected: selected,
        button: true,
        label: '$label${count != null ? ", $count servicios" : ""}',
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: selected
                  ? GhTokens.primary
                  : theme.colorScheme.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: selected
                    ? GhTokens.primary
                    : theme.colorScheme.outlineVariant,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (icon != null) ...<Widget>[
                  Icon(
                    icon,
                    size: 14,
                    color: selected ? Colors.white : GhTokens.muted,
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: selected ? Colors.white : theme.colorScheme.onSurface,
                  ),
                ),
                if (count != null && count! > 0) ...<Widget>[
                  const SizedBox(width: 6),
                  Text(
                    '$count',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: selected
                          ? Colors.white70
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Hoja de filtros y orden (nativa en iOS por el uso de showModalBottomSheet).
class _FilterSheet extends StatefulWidget {
  const _FilterSheet({
    required this.filters,
    required this.minBounds,
    required this.maxBounds,
  });

  final CatalogFilters filters;
  final double minBounds;
  final double maxBounds;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String _sort = widget.filters.sort;
  late RangeValues _range = RangeValues(
    widget.filters.minPrice ?? widget.minBounds,
    widget.filters.maxPrice ?? widget.maxBounds,
  );
  late bool _featuredOnly = widget.filters.featuredOnly;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final max = widget.maxBounds <= widget.minBounds
        ? widget.minBounds + 1
        : widget.maxBounds;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Filtros y orden', style: theme.textTheme.titleLarge),
          const SizedBox(height: 16),
          Text('Ordenar por', style: theme.textTheme.labelMedium),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: const <ButtonSegment<String>>[
              ButtonSegment<String>(
                value: 'featured',
                label: Text('Destacados'),
                icon: Icon(Icons.star_outline_rounded, size: 16),
              ),
              ButtonSegment<String>(
                value: 'price',
                label: Text('Precio'),
                icon: Icon(Icons.attach_money_rounded, size: 16),
              ),
              ButtonSegment<String>(
                value: 'name',
                label: Text('Nombre'),
                icon: Icon(Icons.sort_by_alpha_rounded, size: 16),
              ),
            ],
            selected: <String>{_sort},
            onSelectionChanged: (selection) =>
                setState(() => _sort = selection.first),
          ),
          const SizedBox(height: 20),
          Row(
            children: <Widget>[
              Text('Rango de precio (USD)', style: theme.textTheme.labelMedium),
              const Spacer(),
              Text(
                '${GhFormat.money(_range.start)} – ${GhFormat.money(_range.end)}',
                style: theme.textTheme.bodySmall,
              ),
            ],
          ),
          RangeSlider(
            values: _range,
            min: widget.minBounds,
            max: max,
            divisions: 24,
            labels: RangeLabels(
              GhFormat.money(_range.start),
              GhFormat.money(_range.end),
            ),
            onChanged: (values) => setState(() => _range = values),
          ),
          SwitchListTile(
            value: _featuredOnly,
            onChanged: (value) => setState(() => _featuredOnly = value),
            contentPadding: EdgeInsets.zero,
            title: const Text('Solo destacados'),
            subtitle: const Text('Servicios recomendados por la firma'),
          ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(
                    const CatalogFilters(),
                  ),
                  child: const Text('Limpiar'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(
                    widget.filters.copyWith(
                      sort: _sort,
                      minPrice: _range.start,
                      maxPrice: _range.end,
                      featuredOnly: _featuredOnly,
                    ),
                  ),
                  child: const Text('Aplicar'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
