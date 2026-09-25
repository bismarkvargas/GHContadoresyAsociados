import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/document.dart';
import '../../core/models/message.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/documents_provider.dart';
import '../../core/providers/guest_provider.dart';
import '../../core/providers/messages_provider.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_guest.dart';
import '../../core/widgets/gh_logo.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';

/// Mensajes: bandeja de hilos por expediente o conversación abierta.
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key, this.caseFileId});

  final String? caseFileId;

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  final TextEditingController _composer = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  DocumentItem? _attachment;
  bool _isSending = false;

  @override
  void dispose() {
    _composer.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _pickAttachment() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: GhValidators.allowedExtensions,
      );
      if (result == null || result.files.isEmpty) return;
      final file = result.files.first;
      final error = GhValidators.uploadFile(name: file.name, bytes: file.size);
      if (error != null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
        return;
      }
      if (file.path == null) return;

      final outcome = await uploadDocumentFile(
        ref,
        path: file.path!,
        fileName: file.name,
        category: 'Otro',
        caseFileId: widget.caseFileId,
      );
      if (!mounted) return;
      if (outcome.isSuccess) {
        setState(() => _attachment = outcome.document);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(outcome.error ?? 'No pudimos adjuntar el archivo.')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No pudimos adjuntar el archivo. $e')),
      );
    }
  }

  Future<void> _send() async {
    final body = _composer.text.trim();
    if (body.isEmpty && _attachment == null) return;

    setState(() => _isSending = true);
    final ok = await ref.read(messageComposerProvider.notifier).send(
          body: body.isEmpty
              ? 'Adjunto el documento «${_attachment!.originalName}».'
              : body,
          caseFileId: widget.caseFileId,
          attachment: _attachment,
        );
    if (!mounted) return;
    setState(() {
      _isSending = false;
      if (ok) {
        _composer.clear();
        _attachment = null;
      }
    });
    if (ok) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOut,
          );
        }
      });
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No pudimos enviar el mensaje.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.caseFileId == null) {
      return const _ThreadsList();
    }
    return _Conversation(
      caseFileId: widget.caseFileId!,
      composer: _composer,
      scrollController: _scrollController,
      attachment: _attachment,
      isSending: _isSending,
      onSend: _send,
      onPickAttachment: _pickAttachment,
      onRemoveAttachment: () => setState(() => _attachment = null),
    );
  }
}

/// Bandeja con todos los hilos (un hilo por expediente).
class _ThreadsList extends ConsumerWidget {
  const _ThreadsList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final threads = ref.watch(messageThreadsProvider);
    final isLoggedIn = ref.watch(authProvider).isAuthenticated;

    if (!isLoggedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('Mensajes')),
        body: Column(
          children: <Widget>[
            const GhTopStripe(),
            const Expanded(child: GhGuestState(intent: GuestIntent.messages)),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mensajes'),
        actions: <Widget>[
          IconButton(
            onPressed: () => ref.invalidate(messageThreadsProvider),
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Actualizar',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(messageThreadsProvider);
          await ref.read(messageThreadsProvider.future);
        },
        child: threads.when(
          loading: () => const ListSkeleton(count: 3, lines: 2),
          error: (error, _) => GhErrorState(
            message: 'No pudimos cargar tus conversaciones.',
            onRetry: () => ref.invalidate(messageThreadsProvider),
          ),
          data: (list) {
            if (list.isEmpty) {
              return const GhEmptyState(
                icon: Icons.forum_outlined,
                title: 'Sin conversaciones',
                message:
                    'Cuando tengas un expediente activo podrás escribirle al '
                    'profesional asignado desde aquí.',
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: list.length,
              itemBuilder: (context, index) {
                final thread = list[index];
                final last = thread.lastMessage;
                return GhCard(
                  margin: const EdgeInsets.only(bottom: 10),
                  onTap: () => context.push(AppRoutes.chat(thread.caseFileId)),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: GhTokens.primary50,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.business_center_outlined,
                          size: 20,
                          color: GhTokens.primary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Row(
                              children: <Widget>[
                                Expanded(
                                  child: Text(
                                    thread.caseCode,
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelMedium
                                        ?.copyWith(letterSpacing: 0.3),
                                  ),
                                ),
                                if (last != null)
                                  Text(
                                    GhFormat.relative(last.createdAt),
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(fontSize: 11),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              thread.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: <Widget>[
                                Expanded(
                                  child: Text(
                                    last == null
                                        ? 'Sin mensajes'
                                        : '${last.isFromClient ? "Tú: " : "${last.senderName ?? "Firma"}: "}${last.body}',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context).textTheme.bodySmall,
                                  ),
                                ),
                                if (thread.unreadCount > 0)
                                  Container(
                                    margin: const EdgeInsets.only(left: 8),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 7,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: GhTokens.primary,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Text(
                                      '${thread.unreadCount}',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

/// Conversación de un expediente con envío y adjuntos.
class _Conversation extends ConsumerWidget {
  const _Conversation({
    required this.caseFileId,
    required this.composer,
    required this.scrollController,
    required this.attachment,
    required this.isSending,
    required this.onSend,
    required this.onPickAttachment,
    required this.onRemoveAttachment,
  });

  final String caseFileId;
  final TextEditingController composer;
  final ScrollController scrollController;
  final DocumentItem? attachment;
  final bool isSending;
  final Future<void> Function() onSend;
  final Future<void> Function() onPickAttachment;
  final VoidCallback onRemoveAttachment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final messages = ref.watch(messagesProvider(caseFileId));
    final composerState = ref.watch(messageComposerProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Conversación'),
        actions: <Widget>[
          IconButton(
            onPressed: () => context.push(AppRoutes.caseDetail(caseFileId)),
            icon: const Icon(Icons.folder_open_rounded),
            tooltip: 'Ver expediente',
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          Expanded(
            child: messages.when(
              loading: () => const ListSkeleton(count: 4, lines: 2),
              error: (error, _) => GhErrorState(
                message: 'No pudimos cargar la conversación.',
                onRetry: () => ref.invalidate(messagesProvider(caseFileId)),
              ),
              data: (list) {
                if (list.isEmpty) {
                  return const GhEmptyState(
                    icon: Icons.forum_outlined,
                    title: 'Inicia la conversación',
                    message:
                        'Escribe al profesional asignado: te responderá en horario '
                        'de oficina (lunes a viernes, 8:00 a 17:00).',
                  );
                }
                return ListView.builder(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  physics: const AlwaysScrollableScrollPhysics(),
                  itemCount: list.length,
                  itemBuilder: (context, index) =>
                      _MessageBubble(message: list[index]),
                );
              },
            ),
          ),
          if (composerState is AsyncError) ...<Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: GhInlineNotice(
                message: composerState.error.toString(),
                color: GhTokens.danger,
                icon: Icons.error_outline_rounded,
              ),
            ),
          ],
          if (attachment != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: GhTokens.primary50,
                  borderRadius: GhTokens.controlRadius,
                ),
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.attach_file_rounded,
                        size: 16, color: GhTokens.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        attachment!.originalName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                    IconButton(
                      onPressed: onRemoveAttachment,
                      icon: const Icon(Icons.close_rounded, size: 16),
                      tooltip: 'Quitar adjunto',
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
            ),
          Container(
            padding: EdgeInsets.fromLTRB(
              12,
              10,
              12,
              MediaQuery.viewInsetsOf(context).bottom + 10,
            ),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerLowest,
              border: Border(top: BorderSide(color: theme.colorScheme.outlineVariant)),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  IconButton(
                    onPressed: isSending ? null : onPickAttachment,
                    icon: const Icon(Icons.attach_file_rounded),
                    tooltip: 'Adjuntar documento',
                  ),
                  Expanded(
                    child: TextField(
                      controller: composer,
                      minLines: 1,
                      maxLines: 5,
                      textCapitalization: TextCapitalization.sentences,
                      onSubmitted: (_) => onSend(),
                      decoration: const InputDecoration(
                        hintText: 'Escribe un mensaje…',
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Semantics(
                    button: true,
                    label: 'Enviar mensaje',
                    child: SizedBox(
                      width: 46,
                      height: 46,
                      child: FilledButton(
                        onPressed: isSending ? null : onSend,
                        style: FilledButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: const Size(46, 46),
                        ),
                        child: isSending
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.send_rounded, size: 19),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final Message message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isMine = message.isFromClient;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment:
            isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            mainAxisAlignment:
                isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
            children: <Widget>[
              Icon(
                isMine ? Icons.person_outline_rounded : Icons.business_center_outlined,
                size: 13,
                color: isMine ? GhTokens.muted : GhTokens.primary,
              ),
              const SizedBox(width: 4),
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.sizeOf(context).width * 0.68,
                ),
                child: Text(
                  isMine
                      ? 'Tú'
                      : (message.senderName ?? 'GH Contadores y Asociados'),
                  style: theme.textTheme.labelMedium?.copyWith(fontSize: 11),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                GhFormat.time(message.createdAt),
                style: theme.textTheme.bodySmall?.copyWith(fontSize: 10),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.78,
            ),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isMine
                    ? GhTokens.primary
                    : theme.colorScheme.surfaceContainerLowest,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(14),
                  topRight: const Radius.circular(14),
                  bottomLeft: Radius.circular(isMine ? 14 : 4),
                  bottomRight: Radius.circular(isMine ? 4 : 14),
                ),
                border: isMine
                    ? null
                    : Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  if (message.attachment != null) ...<Widget>[
                    Container(
                      padding: const EdgeInsets.all(8),
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: isMine
                            ? Colors.white24
                            : GhTokens.primary50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Icon(
                            Icons.attach_file_rounded,
                            size: 14,
                            color: isMine ? Colors.white : GhTokens.primary,
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              message.attachment!.originalName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: isMine ? Colors.white : null,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  Text(
                    message.body,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: isMine ? Colors.white : null,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 3),
          Row(
            mainAxisAlignment:
                isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
            children: <Widget>[
              Icon(
                isMine
                    ? (message.readByStaffAt != null
                        ? Icons.done_all_rounded
                        : Icons.done_rounded)
                    : (message.readByClientAt != null
                        ? Icons.done_all_rounded
                        : Icons.done_rounded),
                size: 13,
                color: (isMine ? message.readByStaffAt : message.readByClientAt) != null
                    ? GhTokens.info
                    : GhTokens.muted,
              ),
              const SizedBox(width: 4),
              Text(
                (isMine ? message.readByStaffAt : message.readByClientAt) != null
                    ? 'Leído'
                    : 'Enviado',
                style: theme.textTheme.bodySmall?.copyWith(fontSize: 10),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
