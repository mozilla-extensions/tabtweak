/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global ExtensionAPI */
ChromeUtils.defineModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

const tabTweakPrefs = {
  "browser.search.openintab": true,
  "browser.tabs.closeTabByDblclick": true,
  "browser.tabs.closeWindowWithLastTab": false,
  "browser.tabs.insertAfterCurrent": true,
  "browser.tabs.loadBookmarksInTabs": true
};

this.tabTweak = class extends ExtensionAPI {
  _defaultPrefTweak() {
    let defaultBranch = Services.prefs.getDefaultBranch("");

    for (let [key, value] of Object.entries(tabTweakPrefs)) {
      defaultBranch.setBoolPref(key, value);
    }
  }

  _initDefaultPrefs() {
    this._defaultPrefTweak();

    Services.obs.addObserver(this, "prefservice:after-app-defaults");
  }

  _uninitDefaultPrefs() {
    let defaultBranch = Services.prefs.getDefaultBranch("");

    for (let [key, value] of Object.entries(tabTweakPrefs)) {
      defaultBranch.setBoolPref(key, !value);
    }

    Services.obs.removeObserver(this, "prefservice:after-app-defaults");
  }

  observe(subject, topic) {
    switch (topic) {
      case "prefservice:after-app-defaults":
        this._defaultPrefTweak();
        break;
      default:
        break;
    }
  }

  onShutdown(reason) {
    if (reason === "APP_SHUTDOWN") {
      return;
    }

    this._uninitDefaultPrefs();
  }

  onStartup() {
    this._initDefaultPrefs();
  }
};
