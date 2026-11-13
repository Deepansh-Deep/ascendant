package com.ascendant.gym;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;

/**
 * In-app updater for the sideloaded APK.
 * Downloads the new APK into the app's private cache, then checks, BEFORE Android's installer is opened, that
 * it is the same app, a newer version, and signed with the same key as the installed app.
 * Only an APK that passes all three is handed to the installer, so an update can never force an uninstall
 * (which is what wipes a user's data). Android always asks the user to confirm the install itself.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdater extends Plugin {

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "update.apk");
    }

    private long codeOf(PackageInfo p) {
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
    }

    @SuppressWarnings("deprecation")
    private Set<String> signersOf(PackageInfo p) throws Exception {
        Signature[] sigs;
        if (Build.VERSION.SDK_INT >= 28 && p.signingInfo != null) {
            sigs = p.signingInfo.hasMultipleSigners() ? p.signingInfo.getApkContentsSigners() : p.signingInfo.getSigningCertificateHistory();
        } else {
            sigs = p.signatures;
        }
        Set<String> out = new HashSet<>();
        if (sigs == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : sigs) {
            byte[] d = md.digest(s.toByteArray());
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            out.add(sb.toString());
        }
        return out;
    }

    @SuppressWarnings("deprecation")
    private Set<String> legacySigners(PackageManager pm, String archive, boolean isArchive) {
        try {
            PackageInfo p = isArchive ? pm.getPackageArchiveInfo(archive, PackageManager.GET_SIGNATURES)
                                      : pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNATURES);
            if (p == null) return new HashSet<>();
            if (Build.VERSION.SDK_INT >= 28) p.signingInfo = null;
            return signersOf(p);
        } catch (Exception e) {
            return new HashSet<>();
        }
    }

    @SuppressWarnings("deprecation")
    private int sigFlag() {
        return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void info(PluginCall call) {
        try {
            Context c = getContext();
            PackageInfo me = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("versionName", me.versionName);
            r.put("versionCode", codeOf(me));
            r.put("canInstall", canInstall());
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Opens the "Install unknown apps" switch for this app. The user turns it on once. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent i = Build.VERSION.SDK_INT >= 26
                ? new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                : new Intent(Settings.ACTION_SECURITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Downloads and verifies. Emits "progress" events {pct, mb}. Resolves {ok, reason, versionName}. */
    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("Bad update link"); return; }
        new Thread(() -> {
            File f = apkFile();
            HttpURLConnection con = null;
            try {
                if (f.exists()) f.delete();
                String next = url;
                for (int hop = 0; ; hop++) {            // GitHub redirects release downloads to its file host
                    con = (HttpURLConnection) new URL(next).openConnection();
                    con.setInstanceFollowRedirects(false);
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(30000);
                    int code = con.getResponseCode();
                    if (code >= 300 && code < 400 && hop < 6) {
                        String loc = con.getHeaderField("Location");
                        con.disconnect();
                        if (loc == null || !loc.startsWith("https://")) throw new Exception("Bad redirect");
                        next = loc;
                        continue;
                    }
                    if (code != 200) throw new Exception("Server answered " + code);
                    break;
                }
                long total = con.getContentLengthLong(), got = 0;
                int lastPct = -1;
                try (InputStream in = con.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        got += n;
                        int pct = total > 0 ? (int) (got * 100 / total) : -1;
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject ev = new JSObject();
                            ev.put("pct", pct);
                            ev.put("mb", Math.round(got / 104857.6) / 10.0);
                            notifyListeners("progress", ev);
                        }
                    }
                }
                if (total > 0 && got != total) throw new Exception("Download was cut off. Try again.");

                PackageManager pm = getContext().getPackageManager();
                PackageInfo neu = pm.getPackageArchiveInfo(f.getAbsolutePath(), sigFlag());
                PackageInfo me = pm.getPackageInfo(getContext().getPackageName(), sigFlag());
                if (neu != null && neu.applicationInfo != null) { neu.applicationInfo.sourceDir = f.getAbsolutePath(); neu.applicationInfo.publicSourceDir = f.getAbsolutePath(); }
                JSObject r = new JSObject();
                if (neu == null) { f.delete(); r.put("ok", false); r.put("reason", "broken"); call.resolve(r); return; }
                r.put("versionName", neu.versionName);
                if (!getContext().getPackageName().equals(neu.packageName)) { f.delete(); r.put("ok", false); r.put("reason", "other_app"); call.resolve(r); return; }
                if (codeOf(neu) <= codeOf(me)) { f.delete(); r.put("ok", false); r.put("reason", "not_newer"); call.resolve(r); return; }
                Set<String> a = signersOf(neu), b = signersOf(me);
                if (a.isEmpty()) a = legacySigners(pm, f.getAbsolutePath(), true);
                if (b.isEmpty()) b = legacySigners(pm, null, false);
                if (!a.isEmpty() && !b.isEmpty() && !a.equals(b)) { f.delete(); r.put("ok", false); r.put("reason", "key_mismatch"); call.resolve(r); return; }
                // if this phone cannot read the signatures at all, Android's installer still refuses a wrong key on its own
                r.put("verified", !a.isEmpty() && !b.isEmpty());
                r.put("ok", true);
                call.resolve(r);
            } catch (Exception e) {
                if (f.exists()) f.delete();
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage());
            } finally {
                if (con != null) con.disconnect();
            }
        }).start();
    }

    /** Hands the verified APK to Android's installer. Android shows its own "Update" screen. */
    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile();
        if (!f.exists()) { call.reject("No downloaded update"); return; }
        if (!canInstall()) { call.reject("NEEDS_PERMISSION"); return; }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Opens a link in the phone's real browser (fallback when the in-app download fails). */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("Bad link"); return; }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
