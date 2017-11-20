const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "CustomizableUI",
  "resource:///modules/CustomizableUI.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

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

  handleEvent(evt) {
    let win = evt.target.ownerGlobal;

    switch (evt.type) {
      case "dblclick":
        if (evt.button !== 0 || evt.target.localName !== "tab") {
          return;
        }

        let tab = evt.target;
        if (tab) {
          tab.ownerGlobal.gBrowser.removeTab(tab);
        }
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
    let defBranch = Services.prefs.getDefaultBranch("");

    defBranch.setBoolPref("browser.search.openintab", true);
    defBranch.setBoolPref("browser.tabs.closeWindowWithLastTab", false);
    defBranch.setBoolPref("browser.tabs.loadBookmarksInTabs", true);
  },

  initWindowListener() {
    for (let win of CustomizableUI.windows) {
      this.onWindowOpened(win);
    }

    CustomizableUI.addListener(this);
  },

  onWindowClosed(win) {
    if (!win) {
      return;
    }

    if (win.gBrowser && win.gBrowser.tabContainer) {
      win.gBrowser.tabContainer.removeEventListener("dblclick", this);
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
