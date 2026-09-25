import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
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
      fontFamily: GhTokens.fontFamily,
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
        backgroundColor: scheme.surfaceContainerLowest,
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
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          minimumSize: const Size(0, GhTokens.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: text.labelLarge,
          shape: RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
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
          foregroundColor: scheme.primary,
          minimumSize: const Size(0, GhTokens.minTouchTarget),
          textStyle: text.labelLarge,
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: isDark ? GhTokens.darkSurface2 : GhTokens.surface2,
        selectedColor: scheme.secondaryContainer,
        side: BorderSide(color: scheme.outlineVariant),
        labelStyle: text.labelMedium!,
        shape: RoundedRectangleBorder(borderRadius: GhTokens.controlRadius),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surfaceContainerLowest,
        indicatorColor: scheme.secondaryContainer,
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
      tabBarTheme: TabBarThemeData(
        labelColor: scheme.primary,
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
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: scheme.primary,
        linearTrackColor: scheme.secondaryContainer,
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: scheme.surfaceContainerLowest,
        indicatorColor: scheme.secondaryContainer,
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
    // El acento lima va en `tertiary`: franja, badges e indicadores.
    secondary: GhTokens.accent,
    onSecondary: GhTokens.primary,
    secondaryContainer: GhTokens.accent50,
    onSecondaryContainer: GhTokens.primary,
    tertiary: GhTokens.accent600,
    onTertiary: GhTokens.primary,
    tertiaryContainer: GhTokens.accent50,
    onTertiaryContainer: GhTokens.primary700,
    error: GhTokens.danger,
    onError: Colors.white,
    errorContainer: Color(0xFFFBE9E7),
    onErrorContainer: GhTokens.danger,
    surface: GhTokens.surface2,
    onSurface: GhTokens.ink,
    surfaceContainerLowest: Colors.white,
    surfaceContainerLow: GhTokens.surface2,
    surfaceContainer: GhTokens.surface,
    surfaceContainerHigh: GhTokens.surface,
    surfaceContainerHighest: Color(0xFFE8ECF5),
    onSurfaceVariant: GhTokens.muted,
    outline: GhTokens.border,
    outlineVariant: GhTokens.border,
    shadow: Color(0x14101838),
    scrim: Color(0x80101838),
    inverseSurface: GhTokens.primary700,
    onInverseSurface: Colors.white,
    inversePrimary: GhTokens.accent,
  );

  static const ColorScheme _darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: GhTokens.accent,
    onPrimary: GhTokens.primary700,
    primaryContainer: GhTokens.darkSurface2,
    onPrimaryContainer: GhTokens.accent50,
    secondary: GhTokens.accent,
    onSecondary: GhTokens.primary700,
    secondaryContainer: GhTokens.darkSurface2,
    onSecondaryContainer: GhTokens.accent50,
    tertiary: GhTokens.accent,
    onTertiary: GhTokens.primary700,
    tertiaryContainer: GhTokens.darkSurface2,
    onTertiaryContainer: GhTokens.accent50,
    error: Color(0xFFFF8A7A),
    onError: Color(0xFF3B0A05),
    errorContainer: Color(0xFF5C1A12),
    onErrorContainer: Color(0xFFFFDAD6),
    surface: GhTokens.darkBackground,
    onSurface: Color(0xFFF2F4F9),
    surfaceContainerLowest: GhTokens.darkSurface,
    surfaceContainerLow: GhTokens.darkSurface,
    surfaceContainer: GhTokens.darkSurface2,
    surfaceContainerHigh: GhTokens.darkSurface2,
    surfaceContainerHighest: GhTokens.darkBorder,
    onSurfaceVariant: Color(0xFFAFB8D4),
    outline: GhTokens.darkBorder,
    outlineVariant: GhTokens.darkBorder,
    shadow: Color(0x66000000),
    scrim: Color(0x99000000),
    inverseSurface: Color(0xFFF2F4F9),
    onInverseSurface: GhTokens.primary700,
    inversePrimary: GhTokens.primary,
  );

  static TextTheme _textTheme(ColorScheme scheme) {
    // Tipografía corporativa Montserrat con escala 12/14/16/20/24/32.
    return TextTheme(
      displayLarge: TextStyle(
        fontFamily: GhTokens.fontFamily,
        fontSize: GhTokens.fontDisplay,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.6,
        color: scheme.onSurface,
      ),
      headlineMedium: TextStyle(
        fontFamily: GhTokens.fontFamily,
        fontSize: GhTokens.fontHeadline,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
        color: scheme.onSurface,
      ),
      titleLarge: TextStyle(
        fontFamily: GhTokens.fontFamily,
        fontSize: GhTokens.fontTitle,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
        color: scheme.onSurface,
      ),
      titleMedium: TextStyle(
        fontFamily: GhTokens.fontFamily,
        fontSize: GhTokens.fontBodyLarge,
        fontWeight: FontWeight.w600,
        color: scheme.onSurface,
      ),
      bodyLarge: TextStyle(
        fontFamily: GhTokens.fontFamily,
        fontSize: GhTokens.fontBodyLarge,
        fontWeight: FontWeight.w400,
        height: 1.35,
        color: scheme.onSurface,
      ),
      bodyMedium: TextStyle(
        fontFamily: GhTokens.fontFamily,
        fontSize: GhTokens.fontBody,
        fontWeight: FontWeight.w400,
        height: 1.4,
        color: scheme.onSurface,
      ),
      bodySmall: TextStyle(
        fontFamily: GhTokens.fontFamily,
        fontSize: GhTokens.fontCaption,
        fontWeight: FontWeight.w400,
        height: 1.35,
        color: scheme.onSurfaceVariant,
      ),
      labelLarge: TextStyle(
        fontFamily: GhTokens.fontFamily,
        fontSize: GhTokens.fontBody,
        fontWeight: FontWeight.w600,
        color: scheme.onSurface,
      ),
      labelMedium: TextStyle(
        fontFamily: GhTokens.fontFamily,
        fontSize: GhTokens.fontCaption,
        fontWeight: FontWeight.w600,
        color: scheme.onSurface,
      ),
      labelSmall: TextStyle(
        fontFamily: GhTokens.fontFamily,
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
