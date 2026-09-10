console.log("TB Planner gestartet");


// ============================================================
// TB PLANNER TAB ÖFFNEN
// ============================================================

async function openPlanner() {

  const url =
    browser.runtime.getURL(
      "planner.html"
    );


  const tabs =
    await browser.tabs.query({});


  const existing =
    tabs.find(
      tab => tab.url === url
    );


  if (existing) {

    await browser.tabs.update(
      existing.id,
      {
        active: true
      }
    );

    return;
  }


  await browser.tabs.create({
    url: url
  });
}


// ============================================================
// BUTTON / SHORTCUT
// ============================================================

browser.browserAction.onClicked.addListener(
  openPlanner
);


browser.commands.onCommand.addListener(
  command => {

    if (command === "open-planner") {
      openPlanner();
    }
  }
);
