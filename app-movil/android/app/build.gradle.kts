import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Firebase Cloud Messaging: usa android/app/google-services.json para registrar la app
    // en el proyecto de Firebase y poder recibir notificaciones push.
    id("com.google.gms.google-services")
}

// Firma de producción de GH Contadores.
// Las credenciales viven en android/key.properties (fuera del repositorio). Si el archivo
// no existe —por ejemplo en un clon limpio— se firma con la clave de depuración para que
// el proyecto siga compilando en desarrollo.
// Nota: en el script de Gradle `java` resuelve a la extensión de Java del proyecto, así que
// `Properties` debe importarse arriba en lugar de escribirse como `java.util.Properties`.
val archivoClaves = rootProject.file("key.properties")
val claves = Properties().apply {
    if (archivoClaves.exists()) archivoClaves.inputStream().use { load(it) }
}
val hayFirmaReal = archivoClaves.exists() && claves.getProperty("storeFile") != null

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

    signingConfigs {
        if (hayFirmaReal) {
            create("release") {
                storeFile = file(claves.getProperty("storeFile"))
                storePassword = claves.getProperty("storePassword")
                keyAlias = claves.getProperty("keyAlias")
                keyPassword = claves.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Firma real cuando android/key.properties existe; si no, clave de depuración
            // (solo para compilar en desarrollo, nunca para publicar en Play Store).
            signingConfig = if (hayFirmaReal) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
