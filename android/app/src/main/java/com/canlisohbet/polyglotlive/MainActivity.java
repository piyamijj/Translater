package com.canlisohbet.polyglotlive;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

/**
 * PolyGlot Live AI needs microphone access inside the embedded WebView
 * (getUserMedia). Capacitor's WebView does NOT auto-grant browser-style
 * permission prompts, so we have to:
 *  1) Request the Android runtime permission (RECORD_AUDIO) ourselves.
 *  2) Intercept the WebView's own onPermissionRequest and grant the
 *     matching web resource (audio capture) once the Android permission
 *     is actually held.
 */
public class MainActivity extends BridgeActivity {

    private static final int MIC_PERMISSION_REQUEST_CODE = 5001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Ask for the native RECORD_AUDIO permission up front so the
        // WebView-level grant below has something real to point to.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    MIC_PERMISSION_REQUEST_CODE
            );
        }

        // Let the WebView itself grant getUserMedia(audio) requests coming
        // from the web app, as long as the Android RECORD_AUDIO permission
        // has been granted by the user.
        getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean hasMic = ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.RECORD_AUDIO)
                            == PackageManager.PERMISSION_GRANTED;

                    if (hasMic) {
                        request.grant(request.getResources());
                    } else {
                        request.deny();
                    }
                });
            }
        });
    }
}
