plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "net.ghcontadores.gh_contadores"
    // Se fija la API de compilación: los complementos actuales (file_picker,
    // flutter_plugin_android_lifecycle) exigen compilar contra android-36 o superior.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Requerido por flutter_local_notifications (centro de notificaciones local).
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // GH Contadores y Asociados — app móvil híbrida (Android + iOS).
        applicationId = "net.ghcontadores.gh_contadores"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO(producción): reemplazar por una configuración de firma real
            // (keystore de GH Contadores) antes de publicar en Play Store.
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

// Firebase (opcional): coloca android/app/google-services.json y descomenta el
// plugin en android/settings.gradle.kts según el README §Firebase.

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    // Core library desugaring para flutter_local_notifications.
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
