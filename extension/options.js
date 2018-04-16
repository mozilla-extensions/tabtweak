/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 "use strict";

const options = [
  "closeTabsByDoubleClick",
  "newTabPosition",
  "openBookmarksInNewTabs",
  "openSearchResultsInNewTabs"
];

const untouchable_levels = [
  "controlled_by_other_extensions",
  "not_controllable"
];

window.addEventListener("DOMContentLoaded", async evt => {
  for (let option of options) {
    let getting = await browser.browserSettings[option].get({});
    let p = document.createElement("p");

    let checkbox = document.createElement("input");
    let checked = getting.value;
    if (option === "newTabPosition") {
      checked = getting.value === "afterCurrent";
    }
    checkbox.checked = checked;
    checkbox.disabled = untouchable_levels.includes(getting.levelOfControl);
    checkbox.id = option;
    checkbox.type = "checkbox";
    checkbox.addEventListener("change", async evt => {
      let value = evt.target.checked;
      if (option === "newTabPosition") {
        value = evt.target.checked ? "afterCurrent" : "relatedAfterCurrent";
      }
      let succeeded = await browser.browserSettings[option].set({ value });
      if (!succeeded) {
        console.error(`Fail to set ${option} to ${value}`);
      }
    });
    p.appendChild(checkbox);

    let label = document.createElement("label");
    label.setAttribute("for", option);
    let i18nKey = `option.${option}`;
    label.textContent = browser.i18n.getMessage(i18nKey);
    p.appendChild(label);

    document.body.appendChild(p);
  }
});
