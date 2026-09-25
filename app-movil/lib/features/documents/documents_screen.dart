import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/document.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/documents_provider.dart';
import '../../core/providers/guest_provider.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_guest.dart';
import '../../core/widgets/gh_logo.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';

/// Documentos del cliente: lista por expediente y categoría, previsualización
/// de PDF, descarga y subida de archivos.
class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key, this.caseFileId});

  final String? caseFileId;

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.caseFileId != null) {
        ref.read(documentFiltersProvider.notifier).state =
            DocumentFilters(caseFileId: widget.caseFileId);
      }
    });
  }

  Future<void> _pickAndUpload() async {
    final category = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => _CategoryPicker(
        caseFileId: widget.caseFileId ?? ref.read(documentFiltersProvider).caseFileId,
      ),
    );
    if (category == null) return;

    FilePickerResult? result;
    try {
      result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: GhValidators.allowedExtensions,
        withData: false,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No pudimos abrir el selector de archivos. $e')),
      );
      return;
    }

    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    final path = file.path;
    if (path == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No pudimos leer el archivo seleccionado.')),
      );
      return;
    }

    final validation = GhValidators.uploadFile(name: file.name, bytes: file.size);
    if (validation != null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(validation)),
      );
      return;
    }

    final filters = ref.read(documentFiltersProvider);
    final outcome = await uploadDocumentFile(
      ref,
      path: path,
      fileName: file.name,
      category: category,
      caseFileId: filters.caseFileId ?? widget.caseFileId,
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          outcome.isSuccess
              ? '${file.name} se subió correctamente.'
              : outcome.error ?? 'No pudimos subir el archivo.',
        ),
      ),
    );
  }

  Future<void> _openDocument(DocumentItem document) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _DocumentPreview(document: document),
    );
  }

  Future<void> _download(DocumentItem document) async {
    try {
      final url = await ref.read(documentDownloadUrlProvider(document.id).future);
      final uri = Uri.parse(url);
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw Exception('No se pudo abrir el enlace');
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enlace de descarga generado (válido 15 minutos).'),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No pudimos generar el enlace de descarga.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final filters = ref.watch(documentFiltersProvider);
    final documents = ref.watch(documentsProvider);
    final uploadProgress = ref.watch(uploadProgressProvider);
    final theme = Theme.of(context);
    final isLoggedIn = ref.watch(authProvider).isAuthenticated;

    if (!isLoggedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('Documentos')),
        body: Column(
          children: <Widget>[
            const GhTopStripe(),
            const Expanded(child: GhGuestState(intent: GuestIntent.documents)),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Documentos'),
        actions: <Widget>[
          IconButton(
            onPressed: () => ref.invalidate(documentsProvider),
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Actualizar',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: uploadProgress == null ? _pickAndUpload : null,
        icon: const Icon(Icons.upload_file_rounded),
        label: const Text('Subir'),
        backgroundColor: GhTokens.primary,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: <Widget>[
          if (uploadProgress != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    'Subiendo archivo… ${(uploadProgress * 100).round()}%',
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: uploadProgress,
                      minHeight: 6,
                    ),
                  ),
                ],
              ),
            ),
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: const Text('Todas las categorías'),
                    selected: filters.category == 'all',
                    onSelected: (_) {
                      final current = ref.read(documentFiltersProvider);
                      ref.read(documentFiltersProvider.notifier).state =
                          current.copyWith(category: 'all');
                    },
                  ),
                ),
                for (final category in DocumentCategories.all)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(category),
                      selected: filters.category == category,
                      onSelected: (_) {
                        final current = ref.read(documentFiltersProvider);
                        ref.read(documentFiltersProvider.notifier).state =
                            current.copyWith(category: category);
                      },
                    ),
                  ),
              ],
            ),
          ),
          if (widget.caseFileId != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: GhInlineNotice(
                message: 'Mostrando solo los documentos de este expediente.',
                color: GhTokens.info,
                icon: Icons.filter_alt_outlined,
                action: TextButton(
                  onPressed: () {
                    ref.read(documentFiltersProvider.notifier).state =
                        const DocumentFilters();
                  },
                  child: const Text('Ver todos'),
                ),
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(documentsProvider);
                await ref.read(documentsProvider.future);
              },
              child: documents.when(
                loading: () => const ListSkeleton(count: 4, lines: 1),
                error: (error, _) => GhErrorState(
                  message: 'No pudimos cargar tus documentos.',
                  onRetry: () => ref.invalidate(documentsProvider),
                ),
                data: (list) {
                  if (list.isEmpty) {
                    return GhEmptyState(
                      icon: Icons.description_outlined,
                      title: 'Sin documentos',
                      message:
                          'Sube tu cédula, comprobantes o estados financieros para '
                          'que la firma avance con tu trámite.',
                      actionLabel: 'Subir documento',
                      onAction: _pickAndUpload,
                    );
                  }

                  // Vista con separación por expediente cuando se ven todos.
                  final grouped = <String, List<DocumentItem>>{};
                  for (final doc in list) {
                    final key = doc.caseCode ?? 'Sin expediente';
                    grouped.putIfAbsent(key, () => <DocumentItem>[]).add(doc);
                  }

                  return ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: <Widget>[
                      for (final entry in grouped.entries) ...<Widget>[
                        if (widget.caseFileId == null)
                          GhSectionHeader(
                            title: entry.key,
                            subtitle: '${entry.value.length} documentos',
                            padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
                          ),
                        for (final document in entry.value)
                          _DocumentCard(
                            document: document,
                            onOpen: () => _openDocument(document),
                            onDownload: () => _download(document),
                          ),
                      ],
                    ],
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

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({
    required this.document,
    required this.onOpen,
    required this.onDownload,
  });

  final DocumentItem document;
  final VoidCallback onOpen;
  final VoidCallback onDownload;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GhCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      onTap: onOpen,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 44,
            height: 54,
            decoration: BoxDecoration(
              color: document.isPdf
                  ? GhTokens.primary50
                  : GhTokens.info.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(
                  document.isPdf
                      ? Icons.picture_as_pdf_outlined
                      : Icons.image_outlined,
                  size: 18,
                  color: document.isPdf ? GhTokens.primary : GhTokens.info,
                ),
                const SizedBox(height: 2),
                Text(
                  document.extension,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: document.isPdf ? GhTokens.primary : GhTokens.info,
                  ),
                ),
              ],
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
                const SizedBox(height: 4),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: <Widget>[
                    GhStatusBadge(
                      status: 'Active',
                      label: document.category,
                      compact: true,
                    ),
                    if (document.version > 1)
                      Text(
                        'v${document.version}',
                        style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                      ),
                    Text(
                      GhFormat.fileSize(document.sizeBytes),
                      style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '${document.uploadedByName ?? "Sistema"} · '
                  '${GhFormat.dateTime(document.uploadedAt)}',
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onDownload,
            icon: const Icon(Icons.download_rounded, size: 20),
            tooltip: 'Descargar',
          ),
        ],
      ),
    );
  }
}

/// Selector de categoría para la subida.
class _CategoryPicker extends StatefulWidget {
  const _CategoryPicker({this.caseFileId});

  final String? caseFileId;

  @override
  State<_CategoryPicker> createState() => _CategoryPickerState();
}

class _CategoryPickerState extends State<_CategoryPicker> {
  String _selected = DocumentCategories.clientUploadable.first;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Subir documento', style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            'Formatos permitidos: PDF, PNG, JPG, DOC(X) y XLSX. Tamaño máximo '
            '25 MB.${widget.caseFileId == null ? "" : " Se adjuntará al expediente seleccionado."}',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              for (final category in DocumentCategories.clientUploadable)
                ChoiceChip(
                  label: Text(category),
                  selected: _selected == category,
                  onSelected: (_) => setState(() => _selected = category),
                ),
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => Navigator.of(context).pop(_selected),
              icon: const Icon(Icons.folder_open_rounded, size: 18),
              label: const Text('Elegir archivo'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Previsualización de PDF/imagen con acciones.
class _DocumentPreview extends ConsumerWidget {
  const _DocumentPreview({required this.document});

  final DocumentItem document;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final localPath = document.localPath;
    final hasLocalFile = localPath != null && File(localPath).existsSync();

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 8,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            document.originalName,
            style: theme.textTheme.titleLarge,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            '${document.category} · ${GhFormat.fileSize(document.sizeBytes)} · '
            'v${document.version}',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          Container(
            height: 260,
            width: double.infinity,
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: GhTokens.cardRadius,
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            clipBehavior: Clip.antiAlias,
            child: hasLocalFile && document.isImage
                ? Image.file(File(localPath), fit: BoxFit.contain)
                : _PreviewPlaceholder(document: document),
          ),
          const SizedBox(height: 16),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded, size: 18),
                  label: const Text('Cerrar'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () async {
                    try {
                      final url = await ref
                          .read(documentDownloadUrlProvider(document.id).future);
                      final uri = Uri.parse(url);
                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                    } catch (_) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('No pudimos abrir la previsualización.'),
                        ),
                      );
                    }
                  },
                  icon: const Icon(Icons.open_in_new_rounded, size: 18),
                  label: const Text('Ver completo'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PreviewPlaceholder extends StatelessWidget {
  const _PreviewPlaceholder({required this.document});

  final DocumentItem document;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        Icon(
          document.isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined,
          size: 54,
          color: GhTokens.primary,
        ),
        const SizedBox(height: 12),
        Text(
          document.isPdf
              ? 'Previsualización de PDF'
              : 'Vista previa de la imagen',
          style: theme.textTheme.titleMedium,
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(
            'En producción este visor usa el endpoint de descarga firmado '
            '(HMAC, 15 minutos).',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
        ),
        const SizedBox(height: 14),
        const ShimmerBox(width: 180, height: 10),
        const SizedBox(height: 8),
        const ShimmerBox(width: 140, height: 10),
        const SizedBox(height: 8),
        const ShimmerBox(width: 200, height: 10),
      ],
    );
  }
}
