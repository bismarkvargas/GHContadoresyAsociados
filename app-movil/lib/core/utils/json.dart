import 'dart:convert';

/// Helpers de parsing defensivo: los datos pueden venir de la API o del mock.
typedef JsonMap = Map<String, dynamic>;

JsonMap asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((k, v) => MapEntry(k.toString(), v));
  }
  return <String, dynamic>{};
}

List<JsonMap> asList(Object? value) {
  if (value is List) return value.map(asMap).toList();
  return <JsonMap>[];
}

String? asString(Object? value) {
  if (value == null) return null;
  if (value is String) return value;
  return value.toString();
}

String asStringOr(Object? value, String fallback) => asString(value) ?? fallback;

int? asInt(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

int asIntOr(Object? value, int fallback) => asInt(value) ?? fallback;

double? asDouble(Object? value) {
  if (value == null) return null;
  if (value is double) return value;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}

double asDoubleOr(Object? value, double fallback) => asDouble(value) ?? fallback;

bool asBool(Object? value, {bool fallback = false}) {
  if (value == null) return fallback;
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) {
    final v = value.toLowerCase();
    return v == 'true' || v == '1' || v == 'yes';
  }
  return fallback;
}

DateTime? asDate(Object? value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  final raw = value.toString();
  if (raw.isEmpty) return null;
  return DateTime.tryParse(raw)?.toUtc();
}

List<String> asStringList(Object? value) {
  if (value is List) return value.map((e) => '$e').toList();
  if (value is String && value.isNotEmpty) {
    return value.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
  }
  return const <String>[];
}

/// Listado paginado según docs/03: `{items, total, page, pageSize, totalPages}`.
class Paged<T> {
  const Paged({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
    required this.totalPages,
  });

  final List<T> items;
  final int total;
  final int page;
  final int pageSize;
  final int totalPages;

  bool get hasMore => page < totalPages;

  factory Paged.fromJson(Object? json, T Function(JsonMap) fromJsonItem) {
    final map = asMap(json);
    final items = asList(map['items']).map(fromJsonItem).toList();
    final total = asIntOr(map['total'], items.length);
    final pageSize = asIntOr(map['pageSize'], items.isEmpty ? 0 : items.length);
    final totalPages = asIntOr(
      map['totalPages'],
      pageSize == 0 ? 1 : (total / pageSize).ceil().clamp(1, 1 << 30),
    );
    return Paged<T>(
      items: items,
      total: total,
      page: asIntOr(map['page'], 1),
      pageSize: pageSize,
      totalPages: totalPages,
    );
  }

  static Paged<T> empty<T>() => Paged<T>(
        items: <T>[],
        total: 0,
        page: 1,
        pageSize: 0,
        totalPages: 1,
      );

  Paged<T> copyWith({List<T>? items}) => Paged<T>(
        items: items ?? this.items,
        total: total,
        page: page,
        pageSize: pageSize,
        totalPages: totalPages,
      );
}

/// Serializa a JSON legible (usado por el mock y los logs de debug).
String prettyJson(Object? value) {
  try {
    return const JsonEncoder.withIndent('  ').convert(value);
  } catch (_) {
    return value.toString();
  }
}
