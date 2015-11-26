const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'AddonManager',
  'resource://gre/modules/AddonManager.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Preferences',
  'resource://gre/modules/Preferences.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');

function tabTweak() {}

tabTweak.prototype = {
  classID: Components.ID('{b099d917-fc5e-4712-b3e0-a1fdfc69d476}'),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

  observe: function(aSubject, aTopic, aData) {
    switch (aTopic) {
      case 'profile-after-change':
        Services.ww.registerNotification(this);

        let tilID = 'tabimprovelite@mozillaonline.com';
        let ttkID = 'tabtweak@mozillaonline.com';
        AddonManager.getAddonByID(tilID, (aTIL) => {
          if (aTIL) {
            if (aTIL.isActive) {
              AddonManager.getAddonByID(ttkID, (aTTK) => {
                aTTK.uninstall();
              })
            } else {
              aTIL.uninstall();
              this._init();
            }
          } else {
            this._init();
          }
        });
        break;
      case 'domwindowopened':
        aSubject.addEventListener('DOMContentLoaded', (aEvt) => {
          let win = aEvt.target.defaultView;
          if (!(win instanceof aSubject.ChromeWindow)) {
            return;
          }

          if (this._inited) {
            this._patchWindow(win);
          } else {
            this._cachedWindows.push(win);
          }
        }, false);
        break;
      case 'nsPref:changed':
        if (!aData.startsWith(this.prefs._branchStr)) {
          return;
        }

        let prefKey = aData.slice(this.prefs._branchStr.length);
        if (this._cachedPrefs[prefKey] === undefined) {
          return;
        }
        this._cachedPrefs[prefKey] = this.prefs.get(prefKey, false);
        break;
    }
  },

  get prefs() {
    delete this.prefs;
    return this.prefs = new Preferences("extensions.tabtweak.");
  },
  _cachedPrefs: {
    'newtabNextToCurrent': false
  },
  _cachedWindows: [],
  _inited: false,
  _init: function() {
    this._inited = true;
    for (let prefKey in this._cachedPrefs) {
      this._cachedPrefs[prefKey] = this.prefs.get(prefKey, false);
    }
    this.prefs.observe(undefined, this);

    while (this._cachedWindows.length) {
      this._patchWindow(this._cachedWindows.shift());
    };
  },
  _patchWindow: function(aWin) {
    /**
     * Expose necessary functions on chrome window, in case our patched
     * openLinkIn etc. are eval-ed in another extension.
     */
    aWin.MOA = aWin.MOA || {};
    aWin.MOA.TTK = aWin.MOA.TTK || {
      matchStack: this._matchStack.bind(this)
    };

    if (aWin.gBrowser && aWin.gBrowser.tabContainer) {
      aWin.gBrowser.tabContainer.addEventListener('dblclick', (aEvt) => {
        if (aEvt.button != 0 || aEvt.target.localName !== 'tab') {
          return;
        }

        let tab = aEvt.target;
        if (tab) {
          tab.ownerGlobal.gBrowser.removeTab(tab);
        }
      }, false);
    };

    if (aWin.openLinkIn) {
      aWin.MOA.TTK.openLinkIn = aWin.openLinkIn;
      aWin.openLinkIn = (...args) => {
        // Same as above
        let g;
        try {
          g = aWin;
        } catch(e) {
          g = window;
        };

        if (g.MOA.TTK.matchStack('openLinkIn', Components.stack)) {
          try {
            let uriToLoad = Services.io.newURI(args[0], null, null);
            let topWin = g.getTopWin && g.getTopWin();
            if (topWin && topWin.gBrowser &&
                topWin.BROWSER_NEW_TAB_URL &&
                uriToLoad.spec !== topWin.BROWSER_NEW_TAB_URL) {
              let currentURI = topWin.gBrowser.selectedBrowser.currentURI;
              let inCurrentTab = (topWin.isBlankPageURL &&
                                  topWin.isBlankPageURL(currentURI.spec)) ||
                                 uriToLoad.schemeIs('javascript') ||
                                 uriToLoad.equals(currentURI);
              args[1] = inCurrentTab ? 'current' : 'tab';
            }
            if (typeof args[2] === 'object') {
              args[2].relatedToCurrent = true;
            } else {
              Services.console.logStringMessage('MOA.TTK: Invalid params?');
            }
          } catch(e) {
            Cu.reportError(e);
          };
        }
        return g.MOA.TTK.openLinkIn.apply(g, args);
      }
    };
  },

  _expectedStacks: {
    'openLinkIn': [
      [undefined,
        'openUILinkIn', 'doSearch', 'handleSearchCommand'],
      [undefined,
        'openUILinkIn', 'openUILink', ['CustomizableWidgets<.onViewShowing/<.handleResult/onHistoryVisit',
                                       'HM__onCommand']],
      [undefined,
        'openUILinkIn', 'PUIU_openNodeIn', 'PUIU_openNodeWithEvent', ['BEH_onCommand',
                                                                      'SU_handleTreeClick',
                                                                      'SU_handleTreeKeyPress']],
      ['newtabNextToCurrent',
        'openUILinkIn', ['BrowserOpenTab','ns.browserOpenTab'], ['BrowserOpenNewTabOrWindow',
                                                                 'HandleAppCommandEvent',
                                                                 'nsBrowserAccess.prototype._openURIInNewTab']]
    ]
  },
  _matchStack: function(aType, aStack) {
    return this._expectedStacks[aType].some((aExpected) => {
      let expected = aExpected.slice();
      let prefKey = expected.shift();
      if (prefKey && !this._cachedPrefs[prefKey]) {
        return false;
      }

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
  }
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([tabTweak]);
