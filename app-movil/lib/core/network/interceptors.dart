import 'dart:async';

import 'package:dio/dio.dart';

import '../models/user.dart';
import '../storage/token_store.dart';

/// Añade `Authorization: Bearer <token>` a cada petición autenticada.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._store);

  final TokenStore _store;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _store.accessToken;
    final isPublic = options.extra['public'] == true;
    if (!isPublic && token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    options.headers.putIfAbsent('Accept', () => 'application/json');
    handler.next(options);
  }
}

/// Renueva el access token de forma transparente ante un `401`
/// (rotación de refresh token, docs/03 §2). Un solo refresh a la vez
/// gracias a [QueuedInterceptor].
class RefreshTokenInterceptor extends QueuedInterceptor {
  RefreshTokenInterceptor({
    required Dio dio,
    required TokenStore store,
    required void Function() onSessionExpired,
  })  : _dio = dio,
        _store = store,
        _onSessionExpired = onSessionExpired;

  final Dio _dio;
  final TokenStore _store;
  final void Function() _onSessionExpired;

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final int? status = err.response?.statusCode;
    final bool alreadyRetried = err.requestOptions.extra['retried'] == true;
    final bool isAuthCall = err.requestOptions.path.contains('/auth/');

    if (status != 401 || alreadyRetried || isAuthCall) {
      return handler.next(err);
    }

    final String? refreshToken = _store.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) {
      _onSessionExpired();
      return handler.next(err);
    }

    try {
      final Dio plain = Dio(
        BaseOptions(
          baseUrl: _dio.options.baseUrl,
          connectTimeout: _dio.options.connectTimeout,
          receiveTimeout: _dio.options.receiveTimeout,
          headers: <String, dynamic>{'Accept': 'application/json'},
        ),
      );
      final Response<dynamic> res = await plain.post<dynamic>(
        '/auth/refresh',
        data: <String, dynamic>{'refreshToken': refreshToken},
      );
      final Map<String, dynamic> data = res.data is Map
          ? Map<String, dynamic>.from(res.data as Map)
          : <String, dynamic>{};

      final String newAccess = (data['accessToken'] ?? '').toString();
      if (newAccess.isEmpty) {
        _onSessionExpired();
        return handler.next(err);
      }
      final String newRefresh =
          (data['refreshToken'] ?? '').toString().isEmpty
              ? refreshToken
              : data['refreshToken'].toString();
      final DateTime expiresAt =
          DateTime.tryParse((data['expiresAt'] ?? '').toString()) ??
              DateTime.now().toUtc().add(const Duration(minutes: 60));

      final AppUser user = _store.cachedUser ??
          AppUser.fromJson(Map<String, dynamic>.from(data['user'] as Map? ?? {}));

      await _store.save(
        AuthSession(
          accessToken: newAccess,
          refreshToken: newRefresh,
          expiresAt: expiresAt,
          user: user,
        ),
      );

      final RequestOptions options = err.requestOptions
        ..extra['retried'] = true
        ..headers['Authorization'] = 'Bearer $newAccess';
      final Response<dynamic> retried = await _dio.fetch<dynamic>(options);
      return handler.resolve(retried);
    } catch (_) {
      _onSessionExpired();
      return handler.next(err);
    }
  }
}

/// Detecta caídas de red para activar el *polling* de respaldo.
class ConnectivityInterceptor extends Interceptor {
  ConnectivityInterceptor({this.onNetworkError, this.onNetworkRestored});

  final void Function()? onNetworkError;
  final void Function()? onNetworkRestored;

  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    onNetworkRestored?.call();
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    switch (err.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        onNetworkError?.call();
      default:
        break;
    }
    handler.next(err);
  }
}
