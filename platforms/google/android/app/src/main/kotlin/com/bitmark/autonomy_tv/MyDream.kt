package com.bitmark.autonomy_tv;

import android.service.dreams.DreamService
import android.webkit.WebView
import com.bitmark.autonomy_tv.R.*

class MyDream: DreamService() {
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()

        // Exit dream upon user touch
        isInteractive = false;
        // Hide system UI
        isFullscreen = true;
        // Set the dream layout
        setContentView(layout.dream);

        val myWebView: WebView = findViewById(R.id.webview)
        myWebView.getSettings().loadWithOverviewMode = true;
        myWebView.getSettings().useWideViewPort = true;
        myWebView.getSettings().javaScriptEnabled = true;

        myWebView.loadUrl("https://display.feralfile.com/daily")
    }
}
