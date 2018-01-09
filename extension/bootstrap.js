const { classes: Cc, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "CustomizableUI",
  "resource:///modules/CustomizableUI.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyGetter(this, "CETracking", () => {
  try {
    return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
  } catch (ex) {
    console.error(ex);
    return null;
  }
});

this.tabTweak = {
  _debug: false,

  _expectedStacks: {
    "openLinkIn": [
      ["openUILinkIn", "doSearch", "handleSearchCommandWhere"],
      ["openUILinkIn", "openUILink", ["_createTabElement/<",
                                      "HM__onCommand"]],
      ["openUILinkIn", "PUIU__openNodeIn", "PUIU_openNodeWithEvent", ["_onCommand",
                                                                      "BEH_onCommand",
                                                                      "SU_handleTreeClick",
                                                                      "SU_handleTreeKeyPress"]]
    ]
  },

  _mousedownSinceSelect: new WeakMap(),

  _matchStack(aType, aStack) {
    return this._expectedStacks[aType].some(aExpected => {
      let expected = aExpected.slice();
      let caller = aStack.caller;

      while (expected.length) {
        let last = expected.shift();
        if (Array.isArray(last)) {
          if (last.indexOf(caller.name) < 0) {
            return false;
          }
        } else if (last !== caller.name) {
          return false;
        }

        caller = caller.caller;
      }

      return true;
    });
  },

  defaultPrefTweak() {
    let defBranch = Services.prefs.getDefaultBranch("");

    defBranch.setBoolPref("browser.search.openintab", true);
    defBranch.setBoolPref("browser.tabs.closeWindowWithLastTab", false);
    defBranch.setBoolPref("browser.tabs.loadBookmarksInTabs", true);
  },

  handleEvent(evt) {
    let count;
    let tab;
    let win = evt.target.ownerGlobal;

    switch (evt.type) {
      case "dblclick":
        if (evt.button !== 0 || evt.target.localName !== "tab") {
          break;
        }

        tab = evt.target;
        if (tab) {
          let status = "unknown";
          // get mousedown count before it is reset by "select" from removeTab
          count = this._mousedownSinceSelect.get(win);

          tab.ownerGlobal.gBrowser.removeTab(tab);

          if (isNaN(count)) {
            status = "nan";
          } else {
            status = count > 1 ? `selected` : "other";
          }

          if (CETracking && CETracking.track) {
            CETracking.track(`ttk-dblclick-${status}`);
          }
        }
        break;
      case "mousedown":
        if (evt.button !== 0 || evt.target.localName !== "tab") {
          break;
        }

        tab = evt.target;
        if (tab && tab.selected) {
          count = this._mousedownSinceSelect.get(win) || 0;
          this._mousedownSinceSelect.set(win, count + 1);
        }
        break;
      case "select":
        this._mousedownSinceSelect.set(win, 0);
        break;
      case "MozAfterPaint":
        win.removeEventListener(evt.type, this);

        win.SidebarUI._switcherTarget.addEventListener("SidebarShown", this);
        break;
      case "SidebarShown":
        this.onWindowOpened(win.SidebarUI.browser.contentWindow);
        break;
      default:
        break;
    }
  },

  initDefaultPrefs() {
    this.defaultPrefTweak();

    Services.obs.addObserver(this, "prefservice:after-app-defaults");
  },

  initWindowListener() {
    for (let win of CustomizableUI.windows) {
      this.onWindowOpened(win);
    }

    CustomizableUI.addListener(this);
  },

  observe(subject, topic, data) {
    switch (topic) {
      case "prefservice:after-app-defaults":
        this.defaultPrefTweak();
        break;
      default:
        break;
    }
  },

  onWindowClosed(win) {
    if (!win) {
      return;
    }

    if (win.gBrowser && win.gBrowser.tabContainer) {
      win.gBrowser.tabContainer.removeEventListener("dblclick", this);
      win.gBrowser.tabContainer.removeEventListener("mousedown", this, true);
      win.gBrowser.tabContainer.removeEventListener("select", this);
    }

    if (win.SidebarUI) {
      if (win.SidebarUI._switcherTarget) {
        win.SidebarUI._switcherTarget.removeEventListener("SidebarShown", this);
        this.onWindowClosed(win.SidebarUI.browser.contentWindow);
      } else {
        win.removeEventListener("MozAfterPaint", this);
      }
    }

    if (win.MOA && win.MOA.TTK) {
      if (win.MOA.TTK.openLinkIn) {
        win.openLinkIn = win.MOA.TTK.openLinkIn;
      }

      delete win.MOA.TTK;
      if (Object.keys(win.MOA).length) {
        return;
      }

      delete win.MOA;
    }
  },

  onWindowOpened(win) {
    /**
     * Expose necessary functions on chrome window, in case our patched
     * openLinkIn etc. are eval-ed in another extension.
     */
    win.MOA = win.MOA || {};
    win.MOA.TTK = win.MOA.TTK || {
      matchStack: this._matchStack.bind(this)
    };

    if (win.gBrowser && win.gBrowser.tabContainer) {
      win.gBrowser.tabContainer.addEventListener("dblclick", this);
      win.gBrowser.tabContainer.addEventListener("mousedown", this, true);
      win.gBrowser.tabContainer.addEventListener("select", this);
    }

    if (win.SidebarUI) {
      if (win.SidebarUI._switcherTarget) {
        win.SidebarUI._switcherTarget.addEventListener("SidebarShown", this);
      } else {
        win.addEventListener("MozAfterPaint", this);
      }
    }

    if (win.openLinkIn) {
      win.MOA.TTK.openLinkIn = win.openLinkIn;
      win.openLinkIn = (...args) => {
        // Same as above
        let g;
        try {
          g = win;
        } catch (ex) {
          g = window;
        }

        if (this._debug) {
          g.console.log(Components.stack);
        }

        if (args[1] !== "window") {
          if (g.MOA.TTK.matchStack("openLinkIn", Components.stack)) {
            try {
              let uriToLoad = Services.io.newURI(args[0]);
              let topWin = g.getTopWin && g.getTopWin();
              if (topWin && topWin.gBrowser &&
                  topWin.BROWSER_NEW_TAB_URL &&
                  uriToLoad.spec !== topWin.BROWSER_NEW_TAB_URL) {
                let currentURI = topWin.gBrowser.selectedBrowser.currentURI;
                let inCurrentTab = (topWin.isBlankPageURL &&
                                    topWin.isBlankPageURL(currentURI.spec)) ||
                                   uriToLoad.schemeIs("javascript") ||
                                   uriToLoad.equals(currentURI);
                args[1] = inCurrentTab ? "current" : "tab";
              }
              if (typeof args[2] === "object") {
                args[2].relatedToCurrent = true;
              } else {
                g.console.log("MOA.TTK: Invalid params?");
              }
            } catch (ex) {
              Cu.reportError(ex);
            }
          }
        }

        return g.MOA.TTK.openLinkIn.apply(g, args);
      }
    }
  },

  uninitDefaultPrefs() {
    let defBranch = Services.prefs.getDefaultBranch("");

    defBranch.setBoolPref("browser.search.openintab", false);
    defBranch.setBoolPref("browser.tabs.closeWindowWithLastTab", true);
    defBranch.setBoolPref("browser.tabs.loadBookmarksInTabs", false);

    Services.obs.removeObserver(this, "prefservice:after-app-defaults");
  },

  uninitWindowListener() {
    CustomizableUI.removeListener(this);

    for (let win of CustomizableUI.windows) {
      this.onWindowClosed(win);
    }
  },

  startup() {
    this.initDefaultPrefs();
    this.initWindowListener();
  },

  shutdown() {
    this.uninitDefaultPrefs();
    this.uninitWindowListener();
  }
};

function install() {}
function startup() {
  tabTweak.startup();
}
function shutdown() {
  tabTweak.shutdown();
}
function uninstall() {}
