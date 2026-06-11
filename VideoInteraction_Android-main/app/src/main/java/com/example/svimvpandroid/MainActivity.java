package com.example.svimvpandroid;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.ViewTreeObserver;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings.LayoutAlgorithm;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 7021;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private ViewTreeObserver.OnGlobalLayoutListener keyboardLayoutListener;
    private int lastKeyboardHeightCss = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setBackgroundColor(0xFF111111);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);
        configureWebView();
        installKeyboardOffsetBridge();
        webView.loadUrl("file:///android_asset/web/index.html");
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(true);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setLayoutAlgorithm(LayoutAlgorithm.NORMAL);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String scheme = uri.getScheme();
                return scheme != null && !scheme.startsWith("http") && !scheme.startsWith("file") && !scheme.startsWith("content");
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(resolveAcceptType(params));
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    startActivityForResult(Intent.createChooser(intent, "选择短剧视频"), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "未找到文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });
    }

    private void installKeyboardOffsetBridge() {
        final View root = webView.getRootView();
        keyboardLayoutListener = () -> {
            if (webView == null) return;
            Rect visible = new Rect();
            root.getWindowVisibleDisplayFrame(visible);
            int rootHeight = root.getHeight();
            int obscuredHeight = Math.max(0, rootHeight - visible.bottom);
            int keyboardThreshold = Math.round(rootHeight * 0.15f);
            int keyboardHeightPx = obscuredHeight > keyboardThreshold ? obscuredHeight : 0;
            float density = Math.max(1f, getResources().getDisplayMetrics().density);
            int keyboardHeightCss = Math.round(keyboardHeightPx / density);
            if (Math.abs(keyboardHeightCss - lastKeyboardHeightCss) < 2) return;
            lastKeyboardHeightCss = keyboardHeightCss;
            webView.post(() -> {
                if (webView != null) {
                    webView.evaluateJavascript("window.SVISetKeyboardOffset && window.SVISetKeyboardOffset(" + keyboardHeightCss + ")", null);
                }
            });
        };
        root.getViewTreeObserver().addOnGlobalLayoutListener(keyboardLayoutListener);
    }

    private String resolveAcceptType(WebChromeClient.FileChooserParams params) {
        if (params == null || params.getAcceptTypes() == null) {
            return "*/*";
        }
        for (String type : params.getAcceptTypes()) {
            if (type != null && !type.trim().isEmpty()) {
                return type.trim();
            }
        }
        return "*/*";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) {
            return;
        }
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int i = 0; i < count; i++) {
                    Uri uri = data.getClipData().getItemAt(i).getUri();
                    grantUriPermission(getPackageName(), uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    results[i] = uri;
                }
            } else if (data.getData() != null) {
                Uri uri = data.getData();
                grantUriPermission(getPackageName(), uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                results = new Uri[]{uri};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript("window.SVIAndroidBack ? window.SVIAndroidBack() : 'native'", value -> {
            if (value == null || value.contains("native")) {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    MainActivity.super.onBackPressed();
                }
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            if (keyboardLayoutListener != null) {
                webView.getRootView().getViewTreeObserver().removeOnGlobalLayoutListener(keyboardLayoutListener);
                keyboardLayoutListener = null;
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    public static class AndroidBridge {
        private final Context context;

        AndroidBridge(Context context) {
            this.context = context.getApplicationContext();
        }

        @JavascriptInterface
        public String getDeviceId() {
            String id = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
            return id == null || id.isEmpty() ? "android-webview" : id;
        }

        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }

        @JavascriptInterface
        public void toast(String message) {
            Toast.makeText(context, message == null ? "" : message, Toast.LENGTH_SHORT).show();
        }
    }
}
