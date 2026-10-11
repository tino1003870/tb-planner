console.log("TB Planner Thunderbird Add-on gestartet.");

browser.browserAction.onClicked.addListener(async () => {
    await browser.tabs.create({
        url: browser.runtime.getURL("planner.html")
    });
});

browser.commands.onCommand.addListener(async command => {
    if (command === "open-planner") {
        await browser.tabs.create({
            url: browser.runtime.getURL("planner.html")
        });
    }
});
