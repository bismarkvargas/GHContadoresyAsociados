import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../error/api_failure.dart';
import '../models/document.dart';
import '../models/message.dart';
import 'core_providers.dart';

/// Mensajes de un hilo (por expediente o general).
final messagesProvider = FutureProvider.autoDispose
    .family<List<Message>, String?>((ref, caseFileId) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final result = await client.getMessages(caseFileId: caseFileId, pageSize: 100);
  return result.items;
});

/// Hilos de conversación agrupados por expediente.
final messageThreadsProvider =
    FutureProvider.autoDispose<List<MessageThread>>((ref) async {
  final client = await ref.watch(apiBootstrapProvider.future);
  final cases = await client.getCases(pageSize: 50);

  final threads = <MessageThread>[];
  for (final c in cases.items) {
    final result = await client.getMessages(caseFileId: c.id, pageSize: 50);
    final messages = result.items;
    if (messages.isEmpty) continue;

    final sorted = List<Message>.from(messages)
      ..sort((a, b) {
        final da = a.createdAt ?? DateTime(2000);
        final db = b.createdAt ?? DateTime(2000);
        return da.compareTo(db);
      });

    threads.add(
      MessageThread(
        caseFileId: c.id,
        caseCode: c.code,
        title: c.title,
        lastMessage: sorted.last,
        unreadCount: messages.where((m) => m.isUnreadByClient).length,
        responsibleName: c.responsibleName,
      ),
    );
  }

  threads.sort((a, b) {
    final da = a.lastMessage?.createdAt ?? DateTime(2000);
    final db = b.lastMessage?.createdAt ?? DateTime(2000);
    return db.compareTo(da);
  });
  return threads;
});

/// Total de mensajes sin leer de la firma (badge).
final unreadMessagesProvider = FutureProvider.autoDispose<int>((ref) async {
  final threads = await ref.watch(messageThreadsProvider.future);
  return threads.fold<int>(0, (sum, t) => sum + t.unreadCount);
});

/// Envío de mensajes con adjuntos opcionales.
class MessageComposer extends StateNotifier<AsyncValue<Message?>> {
  MessageComposer(this._ref) : super(const AsyncValue.data(null));

  final Ref _ref;

  Future<bool> send({
    required String body,
    String? caseFileId,
    DocumentItem? attachment,
  }) async {
    state = const AsyncValue.loading();
    try {
      final client = await _ref.read(apiBootstrapProvider.future);
      final message = await client.sendMessage(
        body: body,
        caseFileId: caseFileId,
        attachment: attachment,
      );
      state = AsyncValue.data(message);
      _ref.invalidate(messagesProvider(caseFileId));
      _ref.invalidate(messageThreadsProvider);
      return true;
    } on ApiFailure catch (e, st) {
      state = AsyncValue.error(e.message, st);
      return false;
    }
  }

  void reset() => state = const AsyncValue.data(null);
}

final messageComposerProvider =
    StateNotifierProvider.autoDispose<MessageComposer, AsyncValue<Message?>>((ref) {
  return MessageComposer(ref);
});
