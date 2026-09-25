import 'package:flutter/material.dart';

import 'gh_tokens.dart';

/// Construye el [ThemeData] Material 3 de GH Contadores (claro y oscuro).
class GhTheme {
  const GhTheme._();

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final bool isDark = brightness == Brightness.dark;
    final ColorScheme scheme = isDark ? _darkScheme : _lightScheme;

    final TextTheme text = _textTheme(scheme);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      textTheme: text,
      primaryColor: GhTokens.primary,
      splashFactory: InkSparkle.splashFactory,
      visualDensity: VisualDensity.standard,
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: <TargetPlatform, PageTransitionsBuilder>{
          // iOS / macOS: transición nativa Cupertino.
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          // Android: transición Material 3.
          TargetPlatform.android: ZoomPageTransitionsBuilder(),
        },
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: text.titleLarge,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: scheme.surfaceContainerLowest,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: GhTokens.cardRadius,
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant,
        thickness: 1,
        space: 1,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? GhTokens.darkSurface2 : GhTokens.surface2,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        hintStyle: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
        labelStyle: text.bodyMedium,
        border: OutlineInputBorder(
          borderRadius: GhTokens.controlRadius,
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: GhTokens.controlRadius,
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: GhTokens.controlRadius,
          borderSide: const BorderSide(color: GhTokens.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: GhTokens.controlRadius,
          borderSide: const BorderSide(color: GhTokens.danger, width: 1.4),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: GhTokens.controlRadius,
          borderSide: const BorderSide(color: GhTokens.danger, width: 1.6),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: GhTokens.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, GhTokens.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: text.labelLarge,
          shape: RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: GhTokens.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size(0, GhTokens.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: text.labelLarge,
          shape: RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: scheme.onSurface,
          minimumSize: const Size(0, GhTokens.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          textStyle: text.labelLarge,
          side: BorderSide(color: scheme.outlineVariant),
          shape: RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: GhTokens.primary,
          minimumSize: const Size(0, GhTokens.minTouchTarget),
          textStyle: text.labelLarge,
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: isDark ? GhTokens.darkSurface2 : GhTokens.surface2,
        selectedColor: GhTokens.primary50,
        side: BorderSide(color: scheme.outlineVariant),
        labelStyle: text.labelMedium!,
        shape: RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surfaceContainerLowest,
        indicatorColor: GhTokens.primary50,
        elevation: 0,
        height: 68,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return text.labelSmall?.copyWith(
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            color: selected ? GhTokens.primary : scheme.onSurfaceVariant,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            size: 24,
            color: selected ? GhTokens.primary : scheme.onSurfaceVariant,
          );
        }),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: scheme.surfaceContainerLowest,
        selectedItemColor: GhTokens.primary,
        unselectedItemColor: scheme.onSurfaceVariant,
        type: BottomNavigationBarType.fixed,
      ),
      tabBarTheme: TabBarTheme(
        labelColor: GhTokens.primary,
        unselectedLabelColor: scheme.onSurfaceVariant,
        indicatorColor: GhTokens.primary,
        dividerColor: scheme.outlineVariant,
        labelStyle: text.labelLarge,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? GhTokens.darkSurface2 : GhTokens.ink,
        contentTextStyle: text.bodyMedium?.copyWith(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
        insetPadding: const EdgeInsets.all(16),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surfaceContainerLowest,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: GhTokens.cardRadius),
        titleTextStyle: text.titleLarge,
        contentTextStyle: text.bodyMedium,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerLowest,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      listTileTheme: ListTileThemeData(
        minVerticalPadding: 12,
        iconColor: scheme.onSurfaceVariant,
        titleTextStyle: text.bodyLarge,
        subtitleTextStyle: text.bodySmall,
        shape: RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected) ? Colors.white : null),
        trackColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected) ? GhTokens.primary : null),
        trackOutlineColor:
            WidgetStateProperty.resolveWith((states) => scheme.outlineVariant),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: GhTokens.primary,
        linearTrackColor: GhTokens.primary50,
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: scheme.surfaceContainerLowest,
        indicatorColor: GhTokens.primary50,
        selectedIconTheme: const IconThemeData(color: GhTokens.primary),
        selectedLabelTextStyle:
            text.labelSmall?.copyWith(color: GhTokens.primary),
      ),
      dropdownMenuTheme: DropdownMenuThemeData(
        textStyle: text.bodyMedium,
        menuStyle: MenuStyle(
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
          ),
        ),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          textStyle: WidgetStatePropertyAll(text.labelMedium),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
          ),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: GhTokens.ink,
          borderRadius: BorderRadius.circular(8),
        ),
        textStyle: text.bodySmall?.copyWith(color: Colors.white),
      ),
    );
  }

  static const ColorScheme _lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: GhTokens.primary,
    onPrimary: Colors.white,
    primaryContainer: GhTokens.primary50,
    onPrimaryContainer: GhTokens.primary600,
    secondary: GhTokens.ink,
    onSecondary: Colors.white,
    secondaryContainer: GhTokens.surface,
    onSecondaryContainer: GhTokens.ink,
    tertiary: GhTokens.info,
    onTertiary: Colors.white,
    tertiaryContainer: Color(0xFFE7F0FF),
    onTertiaryContainer: GhTokens.info,
    error: GhTokens.danger,
    onError: Colors.white,
    errorContainer: GhTokens.primary50,
    onErrorContainer: GhTokens.primary600,
    surface: GhTokens.surface2,
    onSurface: GhTokens.ink,
    surfaceContainerLowest: Colors.white,
    surfaceContainerLow: GhTokens.surface2,
    surfaceContainer: GhTokens.surface,
    surfaceContainerHigh: GhTokens.surface,
    surfaceContainerHighest: GhTokens.surface,
    onSurfaceVariant: GhTokens.muted,
    outline: GhTokens.border,
    outlineVariant: GhTokens.border,
    shadow: Color(0x14000000),
    scrim: Color(0x80000000),
    inverseSurface: GhTokens.ink,
    onInverseSurface: Colors.white,
    inversePrimary: GhTokens.primary,
  );

  static const ColorScheme _darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: GhTokens.primary,
    onPrimary: Colors.white,
    primaryContainer: Color(0xFF4A1414),
    onPrimaryContainer: Color(0xFFFFDAD7),
    secondary: GhTokens.surface,
    onSecondary: GhTokens.ink,
    secondaryContainer: GhTokens.darkSurface2,
    onSecondaryContainer: GhTokens.surface,
    tertiary: Color(0xFF7FB0FF),
    onTertiary: Color(0xFF00305F),
    tertiaryContainer: Color(0xFF1B3A5C),
    onTertiaryContainer: Color(0xFFD6E6FF),
    error: Color(0xFFFF6B5E),
    onError: Color(0xFF4A0A05),
    errorContainer: Color(0xFF5C1511),
    onErrorContainer: Color(0xFFFFDAD6),
    surface: GhTokens.darkBackground,
    onSurface: Color(0xFFF2F3F5),
    surfaceContainerLowest: GhTokens.darkSurface,
    surfaceContainerLow: GhTokens.darkSurface,
    surfaceContainer: GhTokens.darkSurface2,
    surfaceContainerHigh: GhTokens.darkSurface2,
    surfaceContainerHighest: Color(0xFF2E333A),
    onSurfaceVariant: Color(0xFFB4BAC3),
    outline: GhTokens.darkBorder,
    outlineVariant: GhTokens.darkBorder,
    shadow: Color(0x66000000),
    scrim: Color(0x99000000),
    inverseSurface: Color(0xFFF2F3F5),
    onInverseSurface: GhTokens.ink,
    inversePrimary: GhTokens.primary600,
  );

  static TextTheme _textTheme(ColorScheme scheme) {
    // Tipografía del sistema con escala 12/14/16/20/24/32.
    return TextTheme(
      displayLarge: TextStyle(
        fontSize: GhTokens.fontDisplay,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.6,
        color: scheme.onSurface,
      ),
      headlineMedium: TextStyle(
        fontSize: GhTokens.fontHeadline,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
        color: scheme.onSurface,
      ),
      titleLarge: TextStyle(
        fontSize: GhTokens.fontTitle,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
        color: scheme.onSurface,
      ),
      titleMedium: TextStyle(
        fontSize: GhTokens.fontBodyLarge,
        fontWeight: FontWeight.w600,
        color: scheme.onSurface,
      ),
      bodyLarge: TextStyle(
        fontSize: GhTokens.fontBodyLarge,
        fontWeight: FontWeight.w400,
        height: 1.35,
        color: scheme.onSurface,
      ),
      bodyMedium: TextStyle(
        fontSize: GhTokens.fontBody,
        fontWeight: FontWeight.w400,
        height: 1.4,
        color: scheme.onSurface,
      ),
      bodySmall: TextStyle(
        fontSize: GhTokens.fontCaption,
        fontWeight: FontWeight.w400,
        height: 1.35,
        color: scheme.onSurfaceVariant,
      ),
      labelLarge: TextStyle(
        fontSize: GhTokens.fontBody,
        fontWeight: FontWeight.w600,
        color: scheme.onSurface,
      ),
      labelMedium: TextStyle(
        fontSize: GhTokens.fontCaption,
        fontWeight: FontWeight.w600,
        color: scheme.onSurface,
      ),
      labelSmall: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        color: scheme.onSurfaceVariant,
      ),
    );
  }

  /// Espaciado y elevación compartidos por las pantallas.
  static BoxDecoration surfaceCard(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return BoxDecoration(
      color: scheme.surfaceContainerLowest,
      borderRadius: GhTokens.cardRadius,
      border: Border.all(color: scheme.outlineVariant),
      boxShadow: GhTokens.cardShadow(Theme.of(context).brightness),
    );
  }
}
