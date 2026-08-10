package com.hanzidojo.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * The app must not wear a browser's scrollbar.
     *
     * Android's WebView draws its own fading vertical scrollbar down the right
     * edge while a page scrolls — the same artefact TestFlight found on iOS,
     * where it is the WKWebView's UIScrollView indicator. The app shell scrolls
     * the document itself (App.jsx's &lt;main&gt; has no scroller of its own), so on
     * both platforms the thing drawing it is the native web view rather than
     * anything in the app's own CSS. One policy, applied in the two shells.
     *
     * Only the bar is turned off. Scrolling, fling and overscroll are separate
     * properties of the view and are untouched, and the web build never runs
     * this code at all.
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setVerticalScrollBarEnabled(false);
            getBridge().getWebView().setHorizontalScrollBarEnabled(false);
        }
    }
}
