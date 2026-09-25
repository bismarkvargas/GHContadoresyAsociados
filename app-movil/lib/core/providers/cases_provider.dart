import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/case_file.dart';
import 'core_providers.dart';

/// Filtros del listado de expedientes.
class CaseFilters {
  const CaseFilters({this.status = 'all', this.search = ''});

  final String status;
  final String search;

  CaseFilters copyWith({String? status, String? search}) =>
      CaseFilters(status: status ?? this.status, search: search ?? this.search);
}

final caseFiltersProvider =
    StateProvider<CaseFilters>((ref) => const CaseFilters());

/// Listado de expedientes visibles para el cliente.
final casesProvider = FutureProvider.autoDispose<List<CaseFile>>((ref) async {
  final filters = ref.watch(caseFiltersProvider);
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getCases(
    status: filters.status == 'all' ? null : filters.status,
    search: filters.search.trim().isEmpty ? null : filters.search.trim(),
    pageSize: 50,
  );
  return result.items;
});

/// Detalle del expediente (cabecera + timeline + tareas + documentos).
final caseDetailProvider =
    FutureProvider.autoDispose.family<CaseFileDetail, String>((ref, id) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  return client.getCase(id);
});

/// Timeline del expediente, recargable por tiempo real.
final caseTimelineProvider =
    FutureProvider.autoDispose.family<List<CaseEvent>, String>((ref, id) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  return client.getCaseTimeline(id);
});

/// Tareas del cliente (todos los expedientes).
final tasksProvider = FutureProvider.autoDispose<List<CaseTask>>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getTasks(pageSize: 100);
  return result.items.where((t) => t.clientVisible).toList();
});

/// Tareas de un expediente concreto.
final caseTasksProvider =
    FutureProvider.autoDispose.family<List<CaseTask>, String>((ref, id) async {
  final detail = await ref.watch(caseDetailProvider(id).future);
  return detail.tasks;
});

/// Marca una tarea como completada desde el app y refresca expediente y home.
final completeTaskProvider =
    FutureProvider.autoDispose.family<CaseTask, String>((ref, taskId) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final task = await client.completeTask(taskId);
  ref.invalidate(tasksProvider);
  ref.invalidate(casesProvider);
  ref.invalidate(dashboardProvider);
  ref.invalidate(caseDetailProvider(task.caseFileId));
  ref.invalidate(caseTimelineProvider(task.caseFileId));
  return task;
});

/// Resumen del home (`GET /me/dashboard`).
final dashboardProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final summary = await client.getDashboard();
  return <String, dynamic>{
    'openCases': summary.openCases,
    'pendingTasks': summary.pendingTasks,
    'newDocuments': summary.newDocuments,
    'unreadMessages': summary.unreadMessages,
    'unreadNotifications': summary.unreadNotifications,
    'pendingOrders': summary.pendingOrders,
    'featuredProducts': summary.featuredProducts,
    'recentCases': summary.recentCases,
    'upcomingTasks': summary.upcomingTasks,
    'latestNotifications': summary.latestNotifications,
    'latestEvents': summary.latestEvents,
  };
});

/// Expedientes en formato resumido para tarjetas del home.
final recentCasesProvider = FutureProvider.autoDispose<List<CaseFile>>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getCases(pageSize: 3);
  return result.items;
});

/// Estadísticas para los gráficos del home (fl_chart) sin backend extra:
/// se derivan de expedientes y tareas ya cargados.
class CaseStats {
  const CaseStats({
    required this.byStatus,
    required this.byMatter,
    required this.totalTasks,
    required this.doneTasks,
  });

  final Map<String, int> byStatus;
  final Map<String, int> byMatter;
  final int totalTasks;
  final int doneTasks;

  double get completionRate =>
      totalTasks == 0 ? 0 : doneTasks / totalTasks;
}

final caseStatsProvider = FutureProvider.autoDispose<CaseStats>((ref) async {
  final cases = await ref.watch(casesProvider.future);
  final tasks = await ref.watch(tasksProvider.future);

  final byStatus = <String, int>{};
  final byMatter = <String, int>{};
  for (final c in cases) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    byMatter[c.matter] = (byMatter[c.matter] ?? 0) + 1;
  }
  return CaseStats(
    byStatus: byStatus,
    byMatter: byMatter,
    totalTasks: tasks.length,
    doneTasks: tasks.where((t) => t.isDone).length,
  );
});
