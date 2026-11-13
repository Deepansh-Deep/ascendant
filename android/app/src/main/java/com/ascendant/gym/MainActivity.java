package com.ascendant.gym;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdater.class);   // in-app updater: download, verify, open Android's installer
        super.onCreate(savedInstanceState);
    }
}
