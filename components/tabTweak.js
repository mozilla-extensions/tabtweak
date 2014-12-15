const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');

function tabTweak() {}

tabTweak.prototype = {
  classID: Components.ID('{b099d917-fc5e-4712-b3e0-a1fdfc69d476}'),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

  observe: function(aSubject, aTopic, aData) {
    switch (aTopic) {
      case 'profile-after-change': {
        this.init();
        break;
      }
      case 'domwindowopened': {
        // Before loaded aSubject.whereToOpenLink is undefined.
        aSubject.addEventListener('DOMContentLoaded', function() {
          let windowtype = aSubject.document.documentElement.getAttribute('windowtype');
          // Ignore console window.
          if (windowtype != 'navigator:browser') return;

          // Close tab on double click.
          aSubject.gBrowser.tabContainer.addEventListener('dblclick', function(aEvent) {
            if (aEvent.button != 0 ||  aEvent.target.localName == 'tabs' ) return;

            let tab = aEvent.target;
            if (tab) aSubject.gBrowser.removeTab(tab);
          }, false);

          // Hack whereToOpenLink for bookmark, history and searchbox (on button clicked).
          let whereToOpenLink = aSubject.whereToOpenLink;
          aSubject.whereToOpenLink = function() {
            switch(Components.stack.caller.name) {
              case 'PUIU_openNodeWithEvent':
              case 'PUIU__openTabset':
              case 'handleSearchCommand': {
                return 'tab';
              }
            }
            return whereToOpenLink.apply(aSubject, arguments);
          }
        });
        break;
      }
    }
  },

  init: function() {
    Services.ww.registerNotification(this);

    let defPrefs = Services.prefs.getDefaultBranch('');
    // Handle searchbox (on Enter pressed).
    defPrefs.setBoolPref('browser.search.openintab', true);
    // Don't close window with last tab.
    defPrefs.setBoolPref('browser.tabs.closeWindowWithLastTab', false);
  }
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([tabTweak]);
