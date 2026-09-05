package com.canlisohbet.polyglotlive;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

/**
 * PolyGlot Live AI needs microphone access inside the embedded WebView
 * (getUserMedia). Capacitor's WebView does NOT auto-grant browser-style
 * permission prompts on its own, so this has to be bridged by hand.
 *
 * IMPORTANT lesson learned from v1.0.1: requesting the native RECORD_AUDIO
 * permission blindly in onCreate() (before the user has any context for why
 * a permission dialog is popping up, and before the WebView has even asked
 * for it) does not reliably work — on many devices/launch configurations the
 * dialog either gets dismissed/denied by the user out of context, or the
 * request fires before the window is fully attached and silently no-ops,
 * leaving RECORD_AUDIO permanently denied for the rest of the session. Every
 * later tap on the mic then fails the same way, which is exactly the
 * symptom that was reported.
 *
 * The fix: request the native permission LAZILY, in direct response to the
 * WebView's own onPermissionRequest callback (i.e. the moment the user
 * actually taps the mic and JS calls getUserMedia). The OS permission dialog
 * then appears in context, right after the user's own action, and we relay
 * the user's actual answer back to the WebView's pending PermissionRequest
 * via onRequestPermissionsResult.
 */
public class MainActivity extends BridgeActivity {

    private static final int MIC_PERMISSION_REQUEST_CODE = 5001;

    // The WebView's own pending getUserMedia() request, held while we wait
    // for the user to answer the native Android permission dialog. This app
    // only ever has one live mic request in flight at a time.
    private PermissionRequest pendingWebPermissionRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean hasMic = ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.RECORD_AUDIO)
                            == PackageManager.PERMISSION_GRANTED;

                    if (hasMic) {
                        request.grant(request.getResources());
                        return;
                    }

                    // Not granted yet — ask right now, in direct response to
                    // the user's own tap, and resolve this exact request once
                    // they answer (see onRequestPermissionsResult below).
                    pendingWebPermissionRequest = request;
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{Manifest.permission.RECORD_AUDIO},
                            MIC_PERMISSION_REQUEST_CODE
                    );
                });
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != MIC_PERMISSION_REQUEST_CODE || pendingWebPermissionRequest == null) {
            return;
        }

        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) {
            pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
        } else {
            pendingWebPermissionRequest.deny();
        }
        pendingWebPermissionRequest = null;
    }
}
