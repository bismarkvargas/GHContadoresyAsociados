# Reglas de ProGuard/R8 para la compilación de release de GH Contadores.
#
# La app usa Flutter y complementos que se comunican con Java/Kotlin mediante
# reflexión (Firebase Messaging, notificaciones locales, SignalR). Se conservan
# las clases críticas para que el modo "release" con minify no rompa nada.

# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# Firebase / FCM
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Notificaciones locales (flutter_local_notifications + GSON del complemento)
-keep class com.dexterous.** { *; }
-keep class com.google.gson.** { *; }
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# SignalR / WebSocket
-keep class com.microsoft.signalr.** { *; }
-dontwarn com.microsoft.signalr.**

# Flutter secure storage (usa cifrado del sistema)
-keep class com.it_nomads.fluttersecurestorage.** { *; }
