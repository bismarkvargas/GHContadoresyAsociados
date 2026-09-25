import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../error/api_failure.dart';
import '../models/document.dart';
import '../utils/validators.dart';
import 'cases_provider.dart';
import 'core_providers.dart';

/// Filtros de la bandeja de documentos.
class DocumentFilters {
  const DocumentFilters({this.caseFileId, this.category = 'all'});

  final String? caseFileId;
  final String category;

  DocumentFilters copyWith({
    String? caseFileId,
    String? category,
    bool clearCase = false,
  }) =>
      DocumentFilters(
        caseFileId: clearCase ? null : (caseFileId ?? this.caseFileId),
        category: category ?? this.category,
      );
}

final documentFiltersProvider =
    StateProvider<DocumentFilters>((ref) => const DocumentFilters());

/// Documentos visibles del cliente.
final documentsProvider =
    FutureProvider.autoDispose<List<DocumentItem>>((ref) async {
  final filters = ref.watch(documentFiltersProvider);
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getDocuments(
    caseFileId: filters.caseFileId,
    category: filters.category == 'all' ? null : filters.category,
    pageSize: 100,
  );
  return result.items;
});

/// Documentos de un expediente concreto.
final caseDocumentsProvider =
    FutureProvider.autoDispose.family<List<DocumentItem>, String>((ref, caseId) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getDocuments(caseFileId: caseId, pageSize: 100);
  return result.items;
});

/// Progreso de subida en curso (0..1) usado por la UI.
final uploadProgressProvider = StateProvider<double?>((ref) => null);

/// Resultado de una subida de documento.
class UploadOutcome {
  const UploadOutcome({this.document, this.error});

  final DocumentItem? document;
  final String? error;

  bool get isSuccess => document != null && error == null;
}

/// Sube un archivo validando tipo y tamaño (docs/02 §5).
Future<UploadOutcome> uploadDocumentFile(
  WidgetRef ref, {
  required String path,
  required String fileName,
  required String category,
  String? caseFileId,
}) async {
  final validation = GhValidators.uploadFile(
    name: fileName,
    bytes: _fileSize(path),
  );
  if (validation != null) return UploadOutcome(error: validation);

  final notifier = ref.read(uploadProgressProvider.notifier);
  notifier.state = 0;
  try {
    final client = await ref.read(apiBootstrapProvider.future);
    final document = await client.uploadDocument(
      filePath: path,
      fileName: fileName,
      category: category,
      caseFileId: caseFileId,
      onProgress: (sent, total) {
        if (total > 0) notifier.state = sent / total;
      },
    );
    notifier.state = null;
    ref.invalidate(documentsProvider);
    if (caseFileId != null) {
      ref.invalidate(caseDocumentsProvider(caseFileId));
      ref.invalidate(dashboardProvider);
    }
    return UploadOutcome(document: document);
  } on ApiFailure catch (e) {
    notifier.state = null;
    return UploadOutcome(error: e.message);
  } catch (e) {
    notifier.state = null;
    return UploadOutcome(error: 'No pudimos subir el archivo. $e');
  }
}

int _fileSize(String path) {
  try {
    final file = File(path);
    if (file.existsSync()) return file.lengthSync();
  } catch (_) {}
  return 1;
}

/// URL de descarga (firmada en producción) de un documento.
final documentDownloadUrlProvider =
    FutureProvider.autoDispose.family<String, String>((ref, id) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  return client.getDocumentDownloadUrl(id);
});
