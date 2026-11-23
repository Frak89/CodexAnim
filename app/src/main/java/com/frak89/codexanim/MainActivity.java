package com.frak89.codexanim;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;

/**
 * Single-source offline app. The same HTML/CIMG codec runs on Android and Windows.
 * Only trusted bundled assets are permitted to access the native save bridge.
 */
public class MainActivity extends Activity {
    private static final int OPEN_FILE = 901;
    private static final int SAVE_FILE = 902;
    private static final int CAMERA_PERMISSION = 903;
    private static final String TRUSTED_HOST = "appassets.androidplatform.net";
    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;
    private ByteArrayOutputStream receiving;
    private byte[] pendingSave;
    private String pendingName, pendingMime;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(10,16,28));
        getWindow().setNavigationBarColor(Color.rgb(10,16,28));
        webView = new WebView(this);
        setContentView(webView);
        WebSettings s=webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new NativeSaver(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r){
                Uri uri=r.getUrl();
                if(!"https".equals(uri.getScheme())||!TRUSTED_HOST.equals(uri.getHost()))return null;
                String path=Uri.decode(uri.getPath());
                if(path==null||!path.startsWith("/assets/")||path.contains(".."))
                    return new WebResourceResponse("text/plain","utf-8",403,"Forbidden",null,new java.io.ByteArrayInputStream(new byte[0]));
                String file=path.substring(8);
                String mime=file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html";
                try{return new WebResourceResponse(mime,"utf-8",getAssets().open(file));}
                catch(Exception e){return new WebResourceResponse("text/plain","utf-8",new java.io.ByteArrayInputStream(new byte[0]));}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return !TRUSTED_HOST.equals(req.getUrl().getHost());
            }
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest req){
                runOnUiThread(()->{
                    if(!TRUSTED_HOST.equals(req.getOrigin().getHost()) ||
                       checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){
                        req.deny();return;
                    }
                    boolean video=Arrays.asList(req.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                    if(video)req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    else req.deny();
                });
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params){
                if(uploadCallback!=null)uploadCallback.onReceiveValue(null);
                uploadCallback=callback;
                try{
                    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    startActivityForResult(intent,OPEN_FILE);
                    return true;
                }catch(Exception ex){uploadCallback=null;return false;}
            }
        });
        webView.loadUrl("https://"+TRUSTED_HOST+"/assets/index.html");
        if(Build.VERSION.SDK_INT>=23 &&
           checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA_PERMISSION);
    }

    private class NativeSaver{
        @JavascriptInterface public synchronized void beginSave(String name,String mime) {
            receiving=new ByteArrayOutputStream();
            pendingName=name.replaceAll("[\\\\/:*?\"<>|]", "_");
            pendingMime=mime;
        }
        @JavascriptInterface public synchronized void appendChunk(String encoded) {
            if(receiving==null)return;
            byte[] data=Base64.decode(encoded,Base64.DEFAULT);
            if(receiving.size()+data.length>100*1024*1024) {receiving=null;throw new IllegalArgumentException("Save limit: 100 MB");}
            receiving.write(data,0,data.length);
        }
        @JavascriptInterface public synchronized void finishSave() {
            if(receiving==null)return;
            pendingSave=receiving.toByteArray();
            receiving=null;
            runOnUiThread(()->{
                Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(pendingMime==null||pendingMime.isEmpty()?"application/octet-stream":pendingMime);
                i.putExtra(Intent.EXTRA_TITLE,pendingName);
                try{startActivityForResult(i,SAVE_FILE);}catch(Exception e){pendingSave=null;}
            });
        }
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==OPEN_FILE){
            if(uploadCallback!=null){
                Uri uri=resultCode==RESULT_OK&&data!=null?data.getData():null;
                uploadCallback.onReceiveValue(uri==null?null:new Uri[]{uri});
                uploadCallback=null;
            }
        }else if(requestCode==SAVE_FILE){
            if(resultCode==RESULT_OK && data!=null && pendingSave!=null){
                try(OutputStream out=getContentResolver().openOutputStream(data.getData())){
                    if(out!=null)out.write(pendingSave);
                }catch(Exception ignored){}
            }
            pendingSave=null;
        }
    }
    @Override public void onBackPressed(){
        webView.evaluateJavascript("window.CodexUI && window.CodexUI.closeFullscreen()",null);
        super.onBackPressed();
    }
    @Override protected void onDestroy(){
        if(webView!=null){
            webView.evaluateJavascript("window.CodexUI && window.CodexUI.stopScanner()",null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
