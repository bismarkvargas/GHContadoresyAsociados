import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/catalog.dart';

/// Intención que un invitado quiso ejecutar antes de iniciar sesión.
enum GuestIntent {
  addToCart,
  cases,
  documents,
  messages,
  orders,
  notifications,
  checkout,
}

/// Textos amables por intención (nunca mensajes técnicos).
extension GuestIntentCopy on GuestIntent {
  String get title {
    switch (this) {
      case GuestIntent.addToCart:
        return 'Inicie sesión para agregar servicios a su carrito';
      case GuestIntent.cases:
        return 'Inicie sesión para ver sus expedientes';
      case GuestIntent.documents:
        return 'Inicie sesión para ver sus documentos';
      case GuestIntent.messages:
        return 'Inicie sesión para ver sus mensajes';
      case GuestIntent.orders:
        return 'Inicie sesión para ver sus compras';
      case GuestIntent.notifications:
        return 'Inicie sesión para ver sus notificaciones';
      case GuestIntent.checkout:
        return 'Inicie sesión para finalizar su compra';
    }
  }

  String get message {
    switch (this) {
      case GuestIntent.addToCart:
        return 'Guarde los servicios que necesita y contrátenos cuando esté '
            'listo. Su carrito queda asociado a su cuenta.';
      case GuestIntent.cases:
        return 'Siga el avance de cada trámite, revise actuaciones y complete '
            'las tareas que dependen de usted.';
      case GuestIntent.documents:
        return 'Consulte y descargue los documentos de sus expedientes, y '
            'súbanos lo que le solicitemos.';
      case GuestIntent.messages:
        return 'Converse directamente con el profesional asignado a su caso.';
      case GuestIntent.orders:
        return 'Revise el historial de pedidos, pagos y recibos de la firma.';
      case GuestIntent.notifications:
        return 'Reciba avisos del avance de sus trámites, documentos y pagos.';
      case GuestIntent.checkout:
        return 'Confirme sus datos de facturación y pague en línea de forma segura.';
    }
  }

  IconData get icon {
    switch (this) {
      case GuestIntent.addToCart:
        return Icons.shopping_cart_outlined;
      case GuestIntent.cases:
        return Icons.folder_open_rounded;
      case GuestIntent.documents:
        return Icons.description_outlined;
      case GuestIntent.messages:
        return Icons.forum_outlined;
      case GuestIntent.orders:
        return Icons.receipt_long_outlined;
      case GuestIntent.notifications:
        return Icons.notifications_none_rounded;
      case GuestIntent.checkout:
        return Icons.lock_outline_rounded;
    }
  }
}

/// Intención que un invitado quiso ejecutar antes de iniciar sesión.
class PendingGuestAction {
  const PendingGuestAction({required this.intent, this.productId, this.deepLink});

  final GuestIntent intent;
  final String? productId;
  final String? deepLink;
}

/// Estado de la intención pendiente de un invitado.
class GuestIntentNotifier extends StateNotifier<PendingGuestAction?> {
  GuestIntentNotifier() : super(null);

  void remember(PendingGuestAction action) => state = action;

  PendingGuestAction? consume() {
    final action = state;
    state = null;
    return action;
  }

  void clear() => state = null;
}

/// Intención pendiente de retomar tras iniciar sesión.
final pendingGuestActionProvider =
    StateNotifierProvider<GuestIntentNotifier, PendingGuestAction?>(
  (ref) => GuestIntentNotifier(),
);

/// Producto que un invitado quiso agregar al carrito.
///
/// `AuthNotifier.login()` lo consume y lo agrega automáticamente al carrito.
final pendingCartProductProvider = StateProvider<Product?>((ref) => null);
