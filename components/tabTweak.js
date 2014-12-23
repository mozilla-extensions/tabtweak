const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
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
        break;
      case 'domwindowopened':
        aSubject.addEventListener('DOMContentLoaded', function(aEvt) {
          let win = aEvt.target.defaultView;
          if (!(win instanceof aSubject.ChromeWindow)) {
            return;
          }

          if (win.gBrowser) {
            win.gBrowser.tabContainer.addEventListener('dblclick', function(aEvt) {
              if (aEvt.button != 0 || aEvt.target.localName !== 'tab') {
                return;
              }

              let tab = aEvt.target;
              if (tab) {
                tab.ownerGlobal.gBrowser.removeTab(tab);
              }
            }, false);

            let addTab = win.gBrowser.addTab;
            win.gBrowser.addTab = function() {
              let args = [].slice.call(arguments);
              if (args.length == 2 && typeof args[1] == "object" &&
                  !(args[1] instanceof Ci.nsIURI) &&
                  self._matchStack('addTab', Components.stack)) {
                args[1].relatedToCurrent = true;
              }
              return addTab.apply(win.gBrowser, args);
            }
          };

          if (win.whereToOpenLink) {
            let whereToOpenLink = win.whereToOpenLink;
            win.whereToOpenLink = function() {
              if (self._matchStack('whereToOpenLink', Components.stack)) {
                return 'tab';
              }
              return whereToOpenLink.apply(win, arguments);
            }
          };
        }, false);
        break;
    }
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

      Services.console.logStringMessage("*** TabTweak ***: Match for " + aType);
      return true;
    });
  }
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([tabTweak]);
