package net.ghcontadores.gh_contadores

import io.flutter.embedding.android.FlutterFragmentActivity

/// `local_auth` necesita un `FragmentActivity` para mostrar el diálogo
/// biométrico del sistema (BiometricPrompt). `FlutterActivity` no lo es.
class MainActivity : FlutterFragmentActivity()
