import 'package:flutter/material.dart';

import '../../core/utils/json.dart';

/// Categoría del catálogo (docs/02 §6: 4 categorías primarias reales).
class ProductCategory {
  const ProductCategory({
    required this.id,
    required this.slug,
    required this.name,
    this.description,
    this.iconName = 'folder',
    this.sortOrder = 0,
    this.productCount = 0,
    this.imageUrl,
  });

  final String id;
  final String slug;
  final String name;
  final String? description;
  final String iconName;
  final int sortOrder;
  final int productCount;
  final String? imageUrl;

  factory ProductCategory.fromJson(JsonMap json) => ProductCategory(
        id: asStringOr(json['id'], asStringOr(json['slug'], '')),
        slug: asStringOr(json['slug'], ''),
        name: asStringOr(json['name'], 'Categoría'),
        description: asString(json['description']),
        iconName: asStringOr(json['iconName'] ?? json['icon'], 'folder'),
        sortOrder: asIntOr(json['sortOrder'] ?? json['order'], 0),
        productCount: asIntOr(json['productCount'], 0),
        imageUrl: asString(json['imageUrl']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'slug': slug,
        'name': name,
        'description': description,
        'iconName': iconName,
        'sortOrder': sortOrder,
        'productCount': productCount,
        'imageUrl': imageUrl,
      };

  IconData get icon {
    switch (iconName) {
      case 'calculator':
        return Icons.calculate_outlined;
      case 'scale':
        return Icons.balance_outlined;
      case 'building':
        return Icons.location_city_outlined;
      case 'receipt':
        return Icons.receipt_long_outlined;
      default:
        return Icons.grid_view_outlined;
    }
  }
}

/// Modo de entrega del servicio.
enum DeliveryMode { digital, presencial, mixto }

DeliveryMode deliveryModeFrom(String? raw) {
  switch (raw) {
    case 'Presencial':
      return DeliveryMode.presencial;
    case 'Mixto':
      return DeliveryMode.mixto;
    case 'Digital':
    default:
      return DeliveryMode.digital;
  }
}

String deliveryModeLabel(DeliveryMode mode) {
  switch (mode) {
    case DeliveryMode.digital:
      return 'Digital';
    case DeliveryMode.presencial:
      return 'Presencial';
    case DeliveryMode.mixto:
      return 'Mixto';
  }
}

/// Servicio del catálogo (producto de la tienda).
class Product {
  const Product({
    required this.id,
    required this.sku,
    required this.slug,
    required this.name,
    required this.price,
    required this.categorySlug,
    required this.categoryName,
    this.currency = 'USD',
    this.taxRate = 13,
    this.shortDescription,
    this.description,
    this.imageUrl,
    this.gallery = const <String>[],
    this.isActive = true,
    this.isFeatured = false,
    this.requiresCase = true,
    this.deliveryMode = DeliveryMode.digital,
    this.estimatedDays,
    this.sortOrder = 0,
    this.sourceUrl,
    this.extraCategories = const <String>[],
  });

  final String id;
  final String sku;
  final String slug;
  final String name;
  final double price;
  final String currency;
  final double taxRate;
  final String categorySlug;
  final String categoryName;
  final String? shortDescription;
  final String? description;
  final String? imageUrl;
  final List<String> gallery;
  final bool isActive;
  final bool isFeatured;
  final bool requiresCase;
  final DeliveryMode deliveryMode;
  final int? estimatedDays;
  final int sortOrder;
  final String? sourceUrl;
  final List<String> extraCategories;

  String get displayDescription =>
      (description != null && description!.trim().isNotEmpty)
          ? description!
          : (shortDescription ?? name);

  String get shortText =>
      (shortDescription != null && shortDescription!.trim().isNotEmpty)
          ? shortDescription!
          : displayDescription;

  /// Días estimados: si el catálogo no los trae, se derivan de la materia.
  int get effectiveEstimatedDays {
    if (estimatedDays != null && estimatedDays! > 0) return estimatedDays!;
    switch (categorySlug) {
      case 'servicios-municipales':
        return 20;
      case 'servicios-tributarios':
        return 10;
      case 'servicios-legales':
        return 15;
      case 'servicios-contables':
        return 7;
      default:
        return 12;
    }
  }

  String get estimatedLabel {
    final days = effectiveEstimatedDays;
    if (days <= 1) return '1 día hábil';
    if (days <= 5) return '$days días hábiles';
    if (days <= 10) return '1 a 2 semanas';
    return '${(days / 5).ceil()} a ${(days / 5).ceil() + 1} semanas';
  }

  factory Product.fromJson(JsonMap json) => Product(
        id: asStringOr(json['id'], asStringOr(json['slug'], '')),
        sku: asStringOr(json['sku'], ''),
        slug: asStringOr(json['slug'], ''),
        name: asStringOr(json['name'], 'Servicio'),
        price: asDoubleOr(json['price'], 0),
        currency: asStringOr(json['currency'], 'USD'),
        taxRate: asDoubleOr(json['taxRate'], 13),
        categorySlug: asStringOr(
          json['categorySlug'] ?? asMap(json['category'])['slug'],
          'servicios-contables',
        ),
        categoryName: asStringOr(
          json['categoryName'] ?? asMap(json['category'])['name'],
          'Servicios',
        ),
        shortDescription: asString(json['shortDescription']),
        description: asString(json['description']),
        imageUrl: asString(json['imageUrl']),
        gallery: asStringList(json['gallery']),
        isActive: asBool(json['isActive'], fallback: true),
        isFeatured: asBool(json['isFeatured']),
        requiresCase: asBool(json['requiresCase'], fallback: true),
        deliveryMode: deliveryModeFrom(asString(json['deliveryMode'])),
        estimatedDays: asInt(json['estimatedDays']),
        sortOrder: asIntOr(json['sortOrder'], 0),
        sourceUrl: asString(json['sourceUrl']),
        extraCategories: asStringList(json['extraCategories']),
      );

  JsonMap toJson() => <String, dynamic>{
        'id': id,
        'sku': sku,
        'slug': slug,
        'name': name,
        'price': price,
        'currency': currency,
        'taxRate': taxRate,
        'categorySlug': categorySlug,
        'categoryName': categoryName,
        'shortDescription': shortDescription,
        'description': description,
        'imageUrl': imageUrl,
        'gallery': gallery,
        'isActive': isActive,
        'isFeatured': isFeatured,
        'requiresCase': requiresCase,
        'deliveryMode': deliveryModeLabel(deliveryMode),
        'estimatedDays': estimatedDays,
        'sortOrder': sortOrder,
        'sourceUrl': sourceUrl,
        'extraCategories': extraCategories,
      };

  Product copyWith({bool? isFeatured, int? sortOrder, String? imageUrl}) => Product(
        id: id,
        sku: sku,
        slug: slug,
        name: name,
        price: price,
        currency: currency,
        taxRate: taxRate,
        categorySlug: categorySlug,
        categoryName: categoryName,
        shortDescription: shortDescription,
        description: description,
        imageUrl: imageUrl ?? this.imageUrl,
        gallery: gallery,
        isActive: isActive,
        isFeatured: isFeatured ?? this.isFeatured,
        requiresCase: requiresCase,
        deliveryMode: deliveryMode,
        estimatedDays: estimatedDays,
        sortOrder: sortOrder ?? this.sortOrder,
        sourceUrl: sourceUrl,
        extraCategories: extraCategories,
      );
}
