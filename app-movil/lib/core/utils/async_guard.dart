import 'dart:async';

/// Utilidades de programación defensiva y asincronía.
class AsyncGuard {
  const AsyncGuard._();

  /// Ejecuta [action] con un tope de tiempo **cancelable**.
  ///
  /// A diferencia de `Future.timeout`, el temporizador interno se cancela en
  /// cuanto [action] termina o falla. Esto importa en dos planos:
  ///  * el binding de `flutter_test` considera un fallo que queden `Timer`
  ///    pendientes al acabar un test (`!timersPending`);
  ///  * en producción no se acumulan temporizadores ociosos en cada arranque.
  static Future<T> withTimeout<T>(
    Future<T> action, {
    required Duration limit,
    String? label,
  }) async {
    final completer = Completer<T>();
    final timer = Timer(limit, () {
      if (completer.isCompleted) return;
      completer.completeError(
        TimeoutException(
          label == null ? 'Tiempo de espera agotado' : 'Tiempo agotado: $label',
          limit,
        ),
      );
    });

    unawaited(
      action.then(
        (value) {
          if (!completer.isCompleted) completer.complete(value);
        },
        onError: (Object error, StackTrace stack) {
          if (!completer.isCompleted) completer.completeError(error, stack);
        },
      ),
    );

    try {
      return await completer.future;
    } finally {
      // Siempre se cancela: el timer nunca sobrevive a la operación.
      timer.cancel();
    }
  }

  /// Alias histórico de [withTimeout] con valor de respaldo opcional.
  static Future<T> timeout<T>(
    Future<T> action, {
    Duration limit = const Duration(seconds: 20),
    T? fallback,
  }) async {
    try {
      return await withTimeout<T>(action, limit: limit);
    } on TimeoutException {
      if (fallback != null) return fallback;
      rethrow;
    }
  }

  /// Espera a que [check] sea verdadero o expira (para arranques tolerantes).
  static Future<bool> waitUntil(
    Future<bool> Function() check, {
    Duration timeout = const Duration(seconds: 10),
    Duration interval = const Duration(milliseconds: 250),
  }) async {
    final DateTime deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      if (await check()) return true;
      await Future<void>.delayed(interval);
    }
    return false;
  }

  /// Reintenta [action] con backoff exponencial.
  static Future<T> retry<T>(
    Future<T> Function() action, {
    int attempts = 3,
    Duration initialDelay = const Duration(milliseconds: 400),
    bool Function(Object error)? shouldRetry,
  }) async {
    Duration delay = initialDelay;
    Object? lastError;
    for (int i = 0; i < attempts; i++) {
      try {
        return await action();
      } catch (e) {
        lastError = e;
        if (shouldRetry != null && !shouldRetry(e)) rethrow;
        if (i == attempts - 1) rethrow;
        await Future<void>.delayed(delay);
        delay *= 2;
      }
    }
    throw lastError!;
  }
}

/// Debouncer simple para el buscador del catálogo.
class Debouncer {
  Debouncer({this.delay = const Duration(milliseconds: 350)});

  final Duration delay;
  Timer? _timer;

  void run(void Function() action) {
    _timer?.cancel();
    _timer = Timer(delay, action);
  }

  void dispose() => _timer?.cancel();
}
