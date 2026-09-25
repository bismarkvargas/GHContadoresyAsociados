import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/auth_provider.dart';
import '../../core/providers/cases_provider.dart';
import '../../core/providers/guest_provider.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/async_guard.dart';
import '../../core/widgets/gh_branding.dart';
import '../../core/widgets/gh_guest.dart';
import '../../core/widgets/gh_logo.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';
import '../../core/widgets/product_card.dart';

/// Mis expedientes: listado con estado, filtros y progreso.
class CasesScreen extends ConsumerStatefulWidget {
  const CasesScreen({super.key});

  @override
  ConsumerState<CasesScreen> createState() => _CasesScreenState();
}

class _CasesScreenState extends ConsumerState<CasesScreen> {
  final TextEditingController _search = TextEditingController();
  final Debouncer _debouncer = Debouncer();

  static const List<({String value, String label})> _filters =
      <({String value, String label})>[
    (value: 'all', label: 'Todos'),
    (value: 'Open', label: 'Abiertos'),
    (value: 'InProgress', label: 'En proceso'),
    (value: 'WaitingClient', label: 'Esperando algo mío'),
    (value: 'Completed', label: 'Completados'),
  ];

  @override
  void dispose() {
    _search.dispose();
    _debouncer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filters = ref.watch(caseFiltersProvider);
    final cases = ref.watch(casesProvider);
    final user = ref.watch(currentUserProvider);
    final isLoggedIn = ref.watch(authProvider).isAuthenticated;

    // Sin sesión: estado de invitado explícito y amable (nunca un error crudo).
    if (!isLoggedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('Mis expedientes')),
        body: Column(
          children: <Widget>[
            const GhTopStripe(),
            const Expanded(child: GhGuestState(intent: GuestIntent.cases)),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis expedientes'),
        actions: <Widget>[
          IconButton(
            onPressed: () => context.push(AppRoutes.documents),
            icon: const Icon(Icons.description_outlined),
            tooltip: 'Documentos',
          ),
          IconButton(
            onPressed: () => context.push(AppRoutes.messages),
            icon: const Icon(Icons.forum_outlined),
            tooltip: 'Mensajes',
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          if (user?.clientId != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: <Widget>[
                  const Icon(Icons.badge_outlined, size: 15, color: GhTokens.muted),
                  const SizedBox(width: 6),
                  Text(
                    'Cliente ${user!.clientId}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const Spacer(),
                  Text(
                    'Actualizado en vivo',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: GhTokens.success,
                          fontSize: 11,
                        ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.sync_rounded, size: 13, color: GhTokens.success),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _search,
              onChanged: (value) => _debouncer.run(() {
                final current = ref.read(caseFiltersProvider);
                ref.read(caseFiltersProvider.notifier).state =
                    current.copyWith(search: value);
              }),
              decoration: InputDecoration(
                hintText: 'Buscar por código, materia o ente…',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close_rounded),
                        tooltip: 'Limpiar',
                        onPressed: () {
                          _search.clear();
                          final current = ref.read(caseFiltersProvider);
                          ref.read(caseFiltersProvider.notifier).state =
                              current.copyWith(search: '');
                          setState(() {});
                        },
                      ),
              ),
            ),
          ),
          SizedBox(
            height: 42,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: <Widget>[
                for (final filter in _filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(filter.label),
                      selected: filters.status == filter.value,
                      onSelected: (_) {
                        final current = ref.read(caseFiltersProvider);
                        ref.read(caseFiltersProvider.notifier).state =
                            current.copyWith(status: filter.value);
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(casesProvider);
                await ref.read(casesProvider.future);
              },
              child: cases.when(
                loading: () => const ListSkeleton(count: 3),
                error: (error, _) => GhErrorState(
                  message:
                      'No pudimos cargar tus expedientes. Desliza para reintentar.',
                  onRetry: () => ref.invalidate(casesProvider),
                ),
                data: (list) {
                  if (list.isEmpty) {
                    return GhEmptyState(
                      title: 'No hay expedientes aquí',
                      message: filters.search.isNotEmpty
                          ? 'No encontramos expedientes con «${filters.search}».'
                          : 'Cuando contrates un servicio se abrirá tu expediente '
                              'y podrás verlo en esta sección.',
                      illustration: GhIllustration.empty,
                      actionLabel: 'Ver servicios',
                      onAction: () => context.go(AppRoutes.services),
                    );
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: list.length,
                    itemBuilder: (context, index) {
                      final caseFile = list[index];
                      return CaseCard(
                        caseFile: caseFile,
                        onTap: () =>
                            context.push(AppRoutes.caseDetail(caseFile.id)),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
