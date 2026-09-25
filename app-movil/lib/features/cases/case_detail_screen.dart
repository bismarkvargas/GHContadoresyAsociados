import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/case_file.dart';
import '../../core/models/document.dart';
import '../../core/providers/cases_provider.dart';
import '../../core/providers/documents_provider.dart';
import '../../core/providers/messages_provider.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/status_labels.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';
import '../../core/widgets/product_card.dart';

/// Detalle del expediente: cabecera, timeline de actuaciones, tareas y documentos.
class CaseDetailScreen extends ConsumerStatefulWidget {
  const CaseDetailScreen({super.key, required this.caseId, this.initialTab});

  final String caseId;
  final String? initialTab;

  @override
  ConsumerState<CaseDetailScreen> createState() => _CaseDetailScreenState();
}

class _CaseDetailScreenState extends ConsumerState<CaseDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(
    length: 4,
    vsync: this,
    initialIndex: switch (widget.initialTab) {
      'tasks' => 1,
      'documents' => 2,
      'messages' => 3,
      _ => 0,
    },
  );

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(caseDetailProvider(widget.caseId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Expediente'),
        actions: <Widget>[
          IconButton(
            onPressed: () => ref.invalidate(caseDetailProvider(widget.caseId)),
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Actualizar',
          ),
        ],
        bottom: detail.maybeWhen(
          data: (_) => TabBar(
            controller: _tabController,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: const <Widget>[
              Tab(text: 'Resumen'),
              Tab(text: 'Tareas'),
              Tab(text: 'Documentos'),
              Tab(text: 'Mensajes'),
            ],
          ),
          orElse: () => null,
        ),
      ),
      body: detail.when(
        loading: () => const _CaseDetailSkeleton(),
        error: (error, _) => GhErrorState(
          message: 'No pudimos cargar el expediente.',
          onRetry: () => ref.invalidate(caseDetailProvider(widget.caseId)),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(caseDetailProvider(widget.caseId));
            await ref.read(caseDetailProvider(widget.caseId).future);
          },
          child: TabBarView(
            controller: _tabController,
            children: <Widget>[
              _SummaryTab(detail: data),
              _TasksTab(detail: data),
              _DocumentsTab(detail: data),
              _MessagesTab(detail: data),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryTab extends ConsumerWidget {
  const _SummaryTab({required this.detail});

  final CaseFileDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final c = detail.caseFile;
    final matterIcon = GhStatus.matterIcons[c.matter] ?? Icons.folder_outlined;
    final pendingTasks =
        detail.tasks.where((t) => !t.isDone && t.clientActionable).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      physics: const AlwaysScrollableScrollPhysics(),
      children: <Widget>[
        // Cabecera del expediente.
        GhCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: GhTokens.primary50,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(matterIcon, size: 20, color: GhTokens.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          c.code,
                          style: theme.textTheme.labelMedium?.copyWith(
                            letterSpacing: 0.4,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        Text(
                          '${c.matter} · ${c.entity}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  GhStatusBadge(status: c.status),
                ],
              ),
              const SizedBox(height: 14),
              Text(c.title, style: theme.textTheme.titleLarge),
              if (c.description != null) ...<Widget>[
                const SizedBox(height: 8),
                Text(
                  c.description!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.5,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              GhProgressBar(progress: c.progress),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 14),
                child: Divider(),
              ),
              _InfoRow(
                icon: Icons.confirmation_number_outlined,
                label: 'Nº de referencia',
                value: c.referenceNumber ?? 'Pendiente de asignar',
              ),
              _InfoRow(
                icon: Icons.person_outline_rounded,
                label: 'Responsable',
                value: c.responsibleName ?? 'Por asignar',
              ),
              _InfoRow(
                icon: Icons.flag_outlined,
                label: 'Prioridad',
                value: GhStatus.label(c.priority),
              ),
              _InfoRow(
                icon: Icons.event_outlined,
                label: 'Apertura',
                value: GhFormat.date(c.openedAt),
              ),
              _InfoRow(
                icon: Icons.event_available_outlined,
                label: 'Vencimiento',
                value: '${GhFormat.date(c.dueAt)} · ${GhFormat.dueLabel(c.dueAt)}',
                highlight: c.isOverdue,
              ),
              if (c.agreedAmount != null)
                _InfoRow(
                  icon: Icons.attach_money_rounded,
                  label: 'Monto pactado',
                  value: GhFormat.money(c.agreedAmount!, currency: c.currency),
                ),
              if (c.orderNumber != null)
                _InfoRow(
                  icon: Icons.receipt_long_outlined,
                  label: 'Pedido origen',
                  value: c.orderNumber!,
                ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Acciones rápidas.
        Row(
          children: <Widget>[
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => context.push(AppRoutes.chat(c.id)),
                icon: const Icon(Icons.forum_outlined, size: 17),
                label: const Text('Mensajes'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => context.push(
                  '${AppRoutes.documents}?caseFileId=${c.id}',
                ),
                icon: const Icon(Icons.upload_file_outlined, size: 17),
                label: const Text('Documentos'),
              ),
            ),
          ],
        ),

        if (pendingTasks.isNotEmpty) ...<Widget>[
          const GhSectionHeader(
            title: 'Acciones que dependen de ti',
            padding: EdgeInsets.fromLTRB(0, 24, 0, 8),
          ),
          for (final task in pendingTasks)
            TaskTile(
              title: task.title,
              subtitle: task.description,
              status: task.status,
              dueAt: task.dueAt,
              priority: task.priority,
              onComplete: () => _complete(context, ref, task),
            ),
        ],

        const GhSectionHeader(
          title: 'Actuaciones del expediente',
          subtitle: 'Timeline en vivo: cada gestión de la firma queda registrada',
          padding: EdgeInsets.fromLTRB(0, 24, 0, 8),
        ),
        _Timeline(events: detail.timeline),
      ],
    );
  }

  Future<void> _complete(BuildContext context, WidgetRef ref, CaseTask task) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Marcar tarea como completada'),
        content: Text(
          '¿Confirmas que completaste «${task.title}»? La firma recibirá el aviso '
          'de inmediato.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sí, completar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await ref.read(completeTaskProvider(task.id).future);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Tarea completada. ¡Gracias!')),
      );
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No pudimos completar la tarea. Intenta de nuevo.')),
      );
    }
  }
}

class _TasksTab extends ConsumerWidget {
  const _TasksTab({required this.detail});

  final CaseFileDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (detail.tasks.isEmpty) {
      return const GhEmptyState(
        icon: Icons.checklist_rounded,
        title: 'Sin tareas por ahora',
        message: 'La firma irá agregando tareas conforme avance el trámite.',
      );
    }

    final pending = detail.tasks.where((t) => !t.isDone).toList();
    final done = detail.tasks.where((t) => t.isDone).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      physics: const AlwaysScrollableScrollPhysics(),
      children: <Widget>[
        if (pending.isNotEmpty) ...<Widget>[
          GhSectionHeader(
            title: 'Pendientes (${pending.length})',
            padding: const EdgeInsets.only(bottom: 8),
          ),
          for (final task in pending)
            TaskTile(
              title: task.title,
              subtitle: task.description,
              status: task.status,
              dueAt: task.dueAt,
              priority: task.priority,
              onComplete: task.clientActionable
                  ? () async {
                      try {
                        await ref.read(completeTaskProvider(task.id).future);
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Tarea marcada como completada.'),
                          ),
                        );
                      } catch (_) {
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('No pudimos completar la tarea.'),
                          ),
                        );
                      }
                    }
                  : null,
            ),
        ],
        if (done.isNotEmpty) ...<Widget>[
          GhSectionHeader(
            title: 'Completadas (${done.length})',
            padding: const EdgeInsets.fromLTRB(0, 16, 0, 8),
          ),
          for (final task in done)
            TaskTile(
              title: task.title,
              status: task.status,
              dueAt: task.dueAt,
              priority: task.priority,
            ),
        ],
      ],
    );
  }
}

class _DocumentsTab extends ConsumerWidget {
  const _DocumentsTab({required this.detail});

  final CaseFileDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final caseDocuments = ref.watch(caseDocumentsProvider(detail.caseFile.id));

    return caseDocuments.when(
      loading: () => const ListSkeleton(count: 3, lines: 1),
      error: (error, _) => GhErrorState(
        message: 'No pudimos cargar los documentos del expediente.',
        onRetry: () => ref.invalidate(caseDocumentsProvider(detail.caseFile.id)),
      ),
      data: (documents) {
        if (documents.isEmpty) {
          return GhEmptyState(
            icon: Icons.description_outlined,
            title: 'Sin documentos todavía',
            message: 'Sube tu cédula o comprobantes para que la firma avance más rápido.',
            actionLabel: 'Subir documento',
            onAction: () => context.push(
              '${AppRoutes.documents}?caseFileId=${detail.caseFile.id}',
            ),
          );
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          physics: const AlwaysScrollableScrollPhysics(),
          children: <Widget>[
            FilledButton.icon(
              onPressed: () => context.push(
                '${AppRoutes.documents}?caseFileId=${detail.caseFile.id}',
              ),
              icon: const Icon(Icons.upload_file_outlined, size: 18),
              label: const Text('Subir documento'),
            ),
            const SizedBox(height: 16),
            for (final document in documents) _DocumentTile(document: document),
          ],
        );
      },
    );
  }
}

class _MessagesTab extends ConsumerWidget {
  const _MessagesTab({required this.detail});

  final CaseFileDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final messages = ref.watch(messagesProvider(detail.caseFile.id));

    return messages.when(
      loading: () => const ListSkeleton(count: 3, lines: 2),
      error: (error, _) => GhErrorState(
        message: 'No pudimos cargar la conversación.',
        onRetry: () => ref.invalidate(messagesProvider(detail.caseFile.id)),
      ),
      data: (list) {
        if (list.isEmpty) {
          return GhEmptyState(
            icon: Icons.forum_outlined,
            title: 'Aún no hay mensajes',
            message: 'Inicia la conversación con el profesional asignado.',
            actionLabel: 'Escribir mensaje',
            onAction: () => context.push(AppRoutes.chat(detail.caseFile.id)),
          );
        }
        final last = list.reversed.take(3).toList().reversed.toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          physics: const AlwaysScrollableScrollPhysics(),
          children: <Widget>[
            FilledButton.icon(
              onPressed: () => context.push(AppRoutes.chat(detail.caseFile.id)),
              icon: const Icon(Icons.forum_outlined, size: 18),
              label: const Text('Abrir conversación completa'),
            ),
            const SizedBox(height: 16),
            for (final message in last)
              GhCard(
                margin: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Icon(
                          message.isFromClient
                              ? Icons.person_outline_rounded
                              : Icons.business_center_outlined,
                          size: 15,
                          color: message.isFromClient
                              ? GhTokens.muted
                              : GhTokens.primary,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          message.senderName ?? 'Firma',
                          style: Theme.of(context).textTheme.labelMedium,
                        ),
                        const Spacer(),
                        Text(
                          GhFormat.relative(message.createdAt),
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                fontSize: 11,
                              ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      message.body,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.events});

  final List<CaseEvent> events;

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) {
      return const GhInlineNotice(
        message: 'Todavía no hay actuaciones registradas en este expediente.',
        color: GhTokens.info,
        icon: Icons.timeline_rounded,
      );
    }

    final theme = Theme.of(context);
    return Column(
      children: <Widget>[
        for (int i = 0; i < events.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Column(
                  children: <Widget>[
                    Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: _eventColor(events[i].type).withValues(alpha: 0.14),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: _eventColor(events[i].type).withValues(alpha: 0.4),
                        ),
                      ),
                      child: Icon(
                        _eventIcon(events[i].type),
                        size: 15,
                        color: _eventColor(events[i].type),
                      ),
                    ),
                    if (i != events.length - 1)
                      Expanded(
                        child: Container(
                          width: 2,
                          color: theme.colorScheme.outlineVariant,
                        ),
                      ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Row(
                          children: <Widget>[
                            Expanded(
                              child: Text(
                                events[i].title,
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            Text(
                              GhFormat.relative(events[i].createdAt),
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                        if (events[i].description != null) ...<Widget>[
                          const SizedBox(height: 4),
                          Text(
                            events[i].description!,
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                        const SizedBox(height: 4),
                        Text(
                          events[i].isSystem
                              ? 'Sistema GH'
                              : (events[i].actorName ?? 'Firma'),
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 11,
                            color: GhTokens.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  static Color _eventColor(String type) {
    switch (type) {
      case 'Created':
        return GhTokens.info;
      case 'StatusChanged':
        return GhTokens.warning;
      case 'TaskCompleted':
        return GhTokens.success;
      case 'DocumentAdded':
        return GhTokens.info;
      case 'MessageAdded':
        return GhTokens.primary;
      case 'PaymentReceived':
        return GhTokens.success;
      default:
        return GhTokens.muted;
    }
  }

  static IconData _eventIcon(String type) {
    switch (type) {
      case 'Created':
        return Icons.add_circle_outline_rounded;
      case 'StatusChanged':
        return Icons.published_with_changes_outlined;
      case 'TaskAdded':
        return Icons.playlist_add_rounded;
      case 'TaskCompleted':
        return Icons.task_alt_rounded;
      case 'DocumentAdded':
        return Icons.attach_file_rounded;
      case 'MessageAdded':
        return Icons.chat_bubble_outline_rounded;
      case 'PaymentReceived':
        return Icons.payments_outlined;
      case 'DueDateChanged':
        return Icons.event_repeat_rounded;
      default:
        return Icons.sticky_note_2_outlined;
    }
  }
}

class _DocumentTile extends ConsumerWidget {
  const _DocumentTile({required this.document});

  final DocumentItem document;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return GhCard(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: () => context.push(
        '${AppRoutes.documents}?caseFileId=${document.caseFileId ?? ''}',
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: GhTokens.primary50,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              document.isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined,
              size: 18,
              color: GhTokens.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  document.originalName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(fontSize: 14),
                ),
                const SizedBox(height: 2),
                Text(
                  '${document.category} · ${GhFormat.fileSize(document.sizeBytes)} · '
                  '${GhFormat.relative(document.uploadedAt)}',
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: GhTokens.muted),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.highlight = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(
            icon,
            size: 16,
            color: highlight ? GhTokens.danger : theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 110,
            child: Text(label, style: theme.textTheme.bodySmall),
          ),
          Expanded(
            child: Text(
              value,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: highlight ? GhTokens.danger : null,
                fontWeight: highlight ? FontWeight.w600 : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CaseDetailSkeleton extends StatelessWidget {
  const _CaseDetailSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const <Widget>[
        ShimmerBox(width: double.infinity, height: 44),
        SizedBox(height: 10),
        ShimmerBox(width: double.infinity, height: 22),
        SizedBox(height: 16),
        ShimmerBox(width: double.infinity, height: 70),
        SizedBox(height: 16),
        CaseCardSkeleton(),
        CaseCardSkeleton(),
      ],
    );
  }
}
