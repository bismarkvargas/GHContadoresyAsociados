import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../error/api_failure.dart';
import '../models/user.dart';
import '../network/api_client.dart';
import '../push/push_permission_service.dart';
import 'cart_provider.dart';
import 'core_providers.dart';
import 'guest_provider.dart';
import 'push_permission_provider.dart';

/// Estado de autenticación de la app (docs/03 §2).
enum AuthStage { unknown, unauthenticated, pending, active, suspended, rejected }

class AuthState {
  const AuthState({
    this.stage = AuthStage.unknown,
    this.user,
    this.session,
    this.isBusy = false,
    this.error,
  });

  final AuthStage stage;
  final AppUser? user;
  final AuthSession? session;
  final bool isBusy;
  final String? error;

  bool get isAuthenticated => stage == AuthStage.active || stage == AuthStage.pending;
  bool get isPending => stage == AuthStage.pending;
  bool get isActive => stage == AuthStage.active;

  AuthState copyWith({
    AuthStage? stage,
    AppUser? user,
    AuthSession? session,
    bool? isBusy,
    String? error,
    bool clearError = false,
  }) =>
      AuthState(
        stage: stage ?? this.stage,
        user: user ?? this.user,
        session: session ?? this.session,
        isBusy: isBusy ?? this.isBusy,
        error: clearError ? null : (error ?? this.error),
      );

  static AuthStage stageFor(UserStatus status) {
    switch (status) {
      case UserStatus.active:
        return AuthStage.active;
      case UserStatus.pending:
        return AuthStage.pending;
      case UserStatus.suspended:
        return AuthStage.suspended;
      case UserStatus.rejected:
        return AuthStage.rejected;
    }
  }
}

/// Notificador de sesión: arranque, login, logout y refresco del perfil.
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._ref) : super(const AuthState());

  final Ref _ref;

  ApiClient get _api => _ref.read(apiClientProvider);

  /// Restaura la sesión guardada o deja el catálogo público.
  Future<void> bootstrap() async {
    final store = _ref.read(tokenStoreProvider);
    await store.load();

    if (!store.isLoggedIn) {
      state = state.copyWith(stage: AuthStage.unauthenticated, clearError: true);
      return;
    }

    final cached = store.cachedUser;
    state = state.copyWith(
      stage: cached == null
          ? AuthStage.unknown
          : AuthState.stageFor(cached.status),
      user: cached,
    );

    // Verifica contra el servidor (o el mock) sin bloquear el arranque.
    try {
      final user = await _api.me();
      await store.updateUser(user);
      state = state.copyWith(stage: AuthState.stageFor(user.status), user: user);
    } on ApiFailure catch (e) {
      if (e.isUnauthorized) {
        await store.clear();
        state = const AuthState(stage: AuthStage.unauthenticated);
      } else if (cached != null) {
        state = state.copyWith(stage: AuthState.stageFor(cached.status), user: cached);
      } else {
        state = state.copyWith(stage: AuthStage.unauthenticated, error: e.message);
      }
    }
  }

  Future<bool> login({required String email, required String password}) async {
    state = state.copyWith(isBusy: true, clearError: true);
    try {
      final session = await _api.login(email: email.trim(), password: password);
      await _ref.read(tokenStoreProvider).save(session);
      state = AuthState(
        stage: AuthState.stageFor(session.user.status),
        user: session.user,
        session: session,
      );
      await _resumeGuestIntent();
      _startRealtime();
      // El token FCM se asocia a la cuenta en cuanto hay sesión (si ya hay
      // permiso); si no lo hay, el aviso de activación lo registra al concederlo.
      unawaited(_syncPushToken());
      return true;
    } on ApiFailure catch (e) {
      state = state.copyWith(isBusy: false, error: e.message);
      return false;
    } catch (e) {
      state = state.copyWith(isBusy: false, error: 'No pudimos iniciar sesión. $e');
      return false;
    }
  }

  /// Registra el token FCM del dispositivo si el permiso ya está concedido.
  ///
  /// `POST /me/devices` asocia el dispositivo al usuario que acaba de entrar.
  Future<void> _syncPushToken() async {
    try {
      final status =
          await _ref.read(pushPermissionProvider.notifier).refresh();
      if (status.isGranted) {
        await _ref.read(pushPermissionProvider.notifier).registerToken();
      }
    } catch (e) {
      debugPrint('[Push] sincronización de token omitida: $e');
    }
  }

  /// Retoma lo que el invitado quería hacer antes de iniciar sesión.
  ///
  /// Hoy: si había un producto pendiente para el carrito, se agrega solo.
  /// La intención se limpia siempre, para que no reaparezca en otra sesión.
  Future<void> _resumeGuestIntent() async {
    final pending = _ref.read(pendingCartProductProvider);
    if (pending == null) {
      _ref.read(pendingGuestActionProvider.notifier).clear();
      return;
    }
    _ref.read(pendingCartProductProvider.notifier).state = null;
    try {
      await _ref.read(cartProvider.notifier).add(pending);
    } catch (_) {
      // Si falla, el usuario puede agregarlo de nuevo desde el catálogo.
    } finally {
      _ref.read(pendingGuestActionProvider.notifier).clear();
    }
  }

  Future<void> logout() async {
    final refresh = state.session?.refreshToken ??
        _ref.read(tokenStoreProvider).refreshToken;
    state = state.copyWith(isBusy: true);
    try {
      if (refresh != null) await _api.logout(refresh);
    } catch (_) {
      await _ref.read(tokenStoreProvider).clear();
    }
    // Se da de baja el dispositivo para no seguir enviando push a esta cuenta.
    await _unregisterPushToken();
    await _ref.read(realtimeServiceProvider).disconnect();
    state = const AuthState(stage: AuthStage.unauthenticated);
  }

  /// Cierre de sesión forzado (refresh token inválido o cuenta eliminada).
  Future<void> forceLogout({String? message}) async {
    await _unregisterPushToken();
    await _ref.read(tokenStoreProvider).clear();
    await _ref.read(realtimeServiceProvider).disconnect();
    state = AuthState(stage: AuthStage.unauthenticated, error: message);
  }

  /// Baja del token FCM en la API (`DELETE /me/devices/{token}`).
  Future<void> _unregisterPushToken() async {
    try {
      await _ref.read(pushPermissionServiceProvider).unregisterToken(
            unregister: (token) => _api.unregisterDevice(token),
          );
    } catch (e) {
      debugPrint('[Push] baja de token omitida: $e');
    }
  }

  Future<void> refreshProfile() async {
    if (!_ref.read(tokenStoreProvider).isLoggedIn) return;
    try {
      final user = await _api.me();
      await _ref.read(tokenStoreProvider).updateUser(user);
      state = state.copyWith(stage: AuthState.stageFor(user.status), user: user);
    } on ApiFailure {
      // Silencioso: el perfil se reintenta en el siguiente arranque.
    }
  }

  Future<bool> updateProfile({
    String? fullName,
    String? phone,
    String? idNumber,
    String? companyName,
    String? address,
    String? province,
    String? canton,
    String? district,
  }) async {
    state = state.copyWith(isBusy: true, clearError: true);
    try {
      final user = await _api.updateProfile(
        fullName: fullName,
        phone: phone,
        idNumber: idNumber,
        companyName: companyName,
        address: address,
        province: province,
        canton: canton,
        district: district,
      );
      await _ref.read(tokenStoreProvider).updateUser(user);
      state = state.copyWith(user: user, isBusy: false);
      return true;
    } on ApiFailure catch (e) {
      state = state.copyWith(isBusy: false, error: e.message);
      return false;
    }
  }

  Future<ApiFailure?> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      await _api.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
      return null;
    } on ApiFailure catch (e) {
      return e;
    }
  }

  Future<ApiFailure?> deleteAccount() async {
    try {
      await _api.deleteAccount();
      await _ref.read(tokenStoreProvider).clear();
      await _ref.read(realtimeServiceProvider).disconnect();
      state = const AuthState(stage: AuthStage.unauthenticated);
      return null;
    } on ApiFailure catch (e) {
      return e;
    }
  }

  /// Aprobación detectada por tiempo real / polling: la cuenta pasa a `Active`.
  void markApproved(AppUser user) {
    state = AuthState(
      stage: AuthState.stageFor(user.status),
      user: user,
      session: state.session,
    );
  }

  /// Conecta el tiempo real sin bloquear el resultado del login.
  ///
  /// El hub tarda en negociar (y en los tests no hay red): esperar aquí
  /// retrasaría el acceso y dejaría el `await` colgado. Si la conexión falla,
  /// el respaldo de *polling* cubre la actualización.
  void _startRealtime() {
    final user = state.user;
    if (user == null) return;
    final token = _ref.read(tokenStoreProvider).accessToken;
    unawaited(
      _ref.read(realtimeServiceProvider).connect(
            userId: user.id,
            accessToken: token,
          ),
    );
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref);
});

/// Usuario actual (o `null` si no hay sesión).
final currentUserProvider = Provider<AppUser?>((ref) => ref.watch(authProvider).user);

/// `true` cuando hay sesión con cuenta aprobada.
final isActiveUserProvider = Provider<bool>(
  (ref) => ref.watch(authProvider).isActive,
);
