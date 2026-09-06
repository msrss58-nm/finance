package com.familyfinance.familyfinance_pro

import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Milestone 7, section 7 — app-switcher / recents-snapshot protection.
 *
 * This is the ONLY native change in the milestone, and it is deliberately
 * minimal: one method channel with one method that toggles the window's
 * FLAG_SECURE. No other native customization is introduced here.
 *
 * FLAG_SECURE is what prevents the OS from capturing this window into the
 * recent-apps thumbnail (it also blocks screenshots — Android exposes no
 * public API that does only the former). The Dart side therefore applies it
 * ONLY while a PIN is configured, so a user who has not opted into the
 * privacy lock keeps ordinary screenshots. See SecureWindowController.
 */
class MainActivity : FlutterActivity() {
    private companion object {
        const val SECURE_WINDOW_CHANNEL = "familyfinance_pro/secure_window"
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SECURE_WINDOW_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "setSecure" -> {
                        val enabled = call.argument<Boolean>("enabled") ?: false
                        if (enabled) {
                            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        } else {
                            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        }
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
