const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'AddonManager',
  'resource://gre/modules/AddonManager.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');

function tabTweak() {}

tabTweak.prototype = {
  classID: Components.ID('{b099d917-fc5e-4712-b3e0-a1fdfc69d476}'),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

  observe: function(aSubject, aTopic, aData) {
    let self = this;

    switch (aTopic) {
      case 'profile-after-change':
        Services.ww.registerNotification(this);

        let tilID = 'tabimprovelite@mozillaonline.com';
        let ttkID = 'tabtweak@mozillaonline.com';
        AddonManager.getAddonByID(tilID, function(aTIL) {
          if (aTIL) {
            if (aTIL.isActive) {
              AddonManager.getAddonByID(ttkID, function(aTTK) {
                aTTK.uninstall();
              })
            } else {
              aTIL.uninstall();
              self._init();
            }
          } else {
            self._init();
          }
        });
        break;
      case 'domwindowopened':
        aSubject.addEventListener('DOMContentLoaded', function(aEvt) {
          let win = aEvt.target.defaultView;
          if (!(win instanceof aSubject.ChromeWindow)) {
            return;
          }

          if (self._inited) {
            self._patchWindow(win);
          } else {
            self._cachedWindows.push(win);
          }
        }, false);
        break;
    }
  },

  _cachedWindows: [],
  _inited: false,
  _init: function() {
    this._inited = true;
    while (this._cachedWindows.length) {
      this._patchWindow(this._cachedWindows.shift());
    };
  },
  _patchWindow: function(aWin) {
    let self = this;

    if (aWin.gBrowser) {
      aWin.gBrowser.tabContainer.addEventListener('dblclick', function(aEvt) {
        if (aEvt.button != 0 || aEvt.target.localName !== 'tab') {
          return;
        }

        let tab = aEvt.target;
        if (tab) {
          tab.ownerGlobal.gBrowser.removeTab(tab);
        }
      }, false);

      let addTab = aWin.gBrowser.addTab;
      aWin.gBrowser.addTab = function() {
        let args = [].slice.call(arguments);
        if (args.length == 2 && typeof args[1] == "object" &&
            !(args[1] instanceof Ci.nsIURI) &&
            self._matchStack('addTab', Components.stack)) {
          args[1].relatedToCurrent = true;
        }
        return addTab.apply(aWin.gBrowser, args);
      }
    };

    if (aWin.whereToOpenLink) {
      let whereToOpenLink = aWin.whereToOpenLink;
      aWin.whereToOpenLink = function() {
        if (self._matchStack('whereToOpenLink', Components.stack)) {
          return 'tab';
        }
        return whereToOpenLink.apply(aWin, arguments);
      }
    };
  },

  _expectedStacks: {
    'addTab': [
      ['loadOneTab', 'openLinkIn', 'openUILinkIn', 'PUIU_openNodeIn', 'PUIU_openNodeWithEvent', 'BEH_onCommand'],
      //['loadTabs', 'PUIU__openTabset', 'PUIU_openContainerInTabs', 'PC_openLinksInTabs'],
      ['loadOneTab', 'openLinkIn', 'openUILinkIn', 'openUILink', 'HM__onCommand'],
      //['loadTabs', 'PUIU__openTabset', 'PUIU_openContainerInTabs', 'SU_handleTreeClick'],
      ['loadOneTab', 'openLinkIn', 'openUILinkIn', 'PUIU_openNodeIn', 'PUIU_openNodeWithEvent', 'SU_handleTreeClick'],
      ['loadOneTab', 'openLinkIn', 'openUILinkIn', 'PUIU_openNodeIn', 'PUIU_openNodeWithEvent', 'SU_handleTreeKeyPress'],
      ['loadOneTab', 'openLinkIn', 'openUILinkIn', 'doSearch', 'handleSearchCommand'],
      ['loadOneTab', 'openLinkIn', 'openUILinkIn', 'openUILink', 'CustomizableWidgets<.onViewShowing/<.handleResult/onHistoryVisit']
    ],
    'whereToOpenLink': [
      ['PUIU_openNodeWithEvent', 'BEH_onCommand'],
      //['PUIU__openTabset', 'PUIU_openContainerInTabs', 'PC_openLinksInTabs'],
      ['openUILink', 'HM__onCommand'],
      //['PUIU__openTabset', 'PUIU_openContainerInTabs', 'SU_handleTreeClick'],
      ['PUIU_openNodeWithEvent', 'SU_handleTreeClick'],
      ['PUIU_openNodeWithEvent', 'SU_handleTreeKeyPress'],
      ['handleSearchCommand'],
      ['openUILink', 'CustomizableWidgets<.onViewShowing/<.handleResult/onHistoryVisit']
    ]
  },
  _matchStack: function(aType, aStack) {
    return this._expectedStacks[aType].some(function(aExpected) {
      let expected = aExpected.slice();
      let caller = aStack.caller;

      while (expected.length) {
        let last = expected.shift();
        if (last !== caller.name) {
          return false;
        }

        caller = caller.caller;
      }

      return true;
    });
  }
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([tabTweak]);
