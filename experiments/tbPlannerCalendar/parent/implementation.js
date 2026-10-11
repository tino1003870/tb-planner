"use strict";

var { ExtensionCommon } =
    ChromeUtils.importESModule(
        "resource://gre/modules/ExtensionCommon.sys.mjs"
    );

var { cal } =
    ChromeUtils.importESModule(
        "resource:///modules/calendar/calUtils.sys.mjs"
    );

function asString(value) {
    return value === null || value === undefined ? "" : String(value);
}

function dateToIcs(value) {
    if (!value) return "";
    try {
        return asString(value.icalString)
            .replace(/^VALUE=DATE:/, "")
            .replace(/^VALUE=DATE-TIME:/, "");
    } catch {
        return asString(value);
    }
}

function dateFromIcs(value) {
    const text = asString(value).trim();
    if (!text) return null;

    const match =
        text.match(/^([0-9]{4})([0-9]{2})([0-9]{2})(?:T([0-9]{2})([0-9]{2})([0-9]{2})Z?)?$/);

    if (!match) throw new Error(`Ungültiges Datum: ${text}`);

    const date = cal.createDateTime();
    date.year = Number(match[1]);
    date.month = Number(match[2]) - 1;
    date.day = Number(match[3]);

    if (match[4]) {
        date.hour = Number(match[4]);
        date.minute = Number(match[5]);
        date.second = Number(match[6]);
        date.isDate = false;
    } else {
        date.hour = 0;
        date.minute = 0;
        date.second = 0;
        date.isDate = true;
    }

    return date;
}

function shiftDateIcs(value, days) {
    if (!value) return "";

    const date = dateFromIcs(value);
    const js = new Date(date.year, date.month, date.day);
    js.setDate(js.getDate() + Number(days));

    return `${js.getFullYear()}${String(js.getMonth() + 1).padStart(2, "0")}${String(js.getDate()).padStart(2, "0")}`;
}

function getCalendar(calendarId) {
    const calendar =
        cal.manager.getCalendars()
            .find(item => item.id === calendarId);

    if (!calendar) {
        throw new Error(`Kalender nicht gefunden: ${calendarId}`);
    }

    return calendar;
}

function getProperty(item, name) {
    try {
        return item.getProperty(name);
    } catch {
        return null;
    }
}

function itemToPlain(calendar, item) {
    const percent = Number(
        item.percentComplete ??
        getProperty(item, "PERCENT-COMPLETE") ??
        0
    );

    return {
        calendarId: asString(calendar.id),
        uid: asString(item.id),
        id: asString(item.id),
        summary: asString(item.title || getProperty(item, "SUMMARY")),
        description: asString(item.description || getProperty(item, "DESCRIPTION")),
        status: asString(item.status || getProperty(item, "STATUS")) || "NEEDS-ACTION",
        percentComplete: Number.isFinite(percent) ? percent : 0,
        dtstart: dateToIcs(item.entryDate || getProperty(item, "DTSTART")),
        due: dateToIcs(item.dueDate || getProperty(item, "DUE")),
        wbs: asString(getProperty(item, "X-TB-PLANNER-WBS")),
        parent: asString(getProperty(item, "X-TB-PLANNER-PARENT")),
        order: Number(getProperty(item, "X-TB-PLANNER-ORDER")),
        type: "VTODO"
    };
}

function isSuccessStatus(status) {
    // nsresult success is exactly 0. Avoid Components.isSuccessCode(),
    // because Components may not be exposed in this experiment context.
    return Number(status) === 0;
}

async function getAllTodos(calendar) {
    console.log(
        "WebExtensions: TB Planner: getAllTodos() START",
        calendar?.id
    );

    /*
     * Do not use ITEM_FILTER_TYPE_TODO here.
     *
     * The CalDAV provider used by Thunderbird has already demonstrated
     * that getItems(ITEM_FILTER_ALL_ITEMS, ...) returns the calendar
     * objects correctly. We therefore query all items and explicitly
     * select VTODOs below. This also gives us useful diagnostics when
     * a provider returns events together with tasks.
     *
     * Thunderbird 96+ returns a ReadableStream from getItems().
     */
    try {
        console.log(
            "WebExtensions: TB Planner: getAllTodos() calling calendar.getItems(ALL_ITEMS)"
        );

        const stream = calendar.getItems(
            Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
            0,
            null,
            null
        );

        console.log(
            "WebExtensions: TB Planner: getAllTodos() getItems() returned stream"
        );

        const iterator = cal.iterate.streamValues(stream);
        const todos = [];
        let batchNumber = 0;
        let totalItems = 0;

        console.log(
            "WebExtensions: TB Planner: getAllTodos() iterating stream"
        );

        for await (const batch of iterator) {
            batchNumber++;

            console.log(
                "WebExtensions: TB Planner: getAllTodos() stream batch",
                batchNumber,
                "count=", batch?.length ?? 0
            );

            for (const item of batch || []) {
                if (!item) {
                    continue;
                }

                totalItems++;

                const itemType = asString(item.itemType);

                // Some CalDAV providers in current Thunderbird versions
                // return a calIItemBase whose itemType property is empty,
                // even though the object is a VTODO.  Do not rely on
                // item.itemType alone.  Prefer the ICS representation and
                // finally fall back to the calITodo interface.
                let isTodo = itemType.toUpperCase() === "VTODO";
                let icalType = "";

                if (!isTodo) {
                    try {
                        const ical = asString(item.icalString);
                        if (/BEGIN:VTODO/i.test(ical)) {
                            isTodo = true;
                            icalType = "VTODO";
                        } else if (/BEGIN:VEVENT/i.test(ical)) {
                            icalType = "VEVENT";
                        }
                    } catch (error) {
                        console.log(
                            "WebExtensions: TB Planner: item icalString konnte nicht gelesen werden",
                            error
                        );
                    }
                }

                if (!isTodo) {
                    try {
                        item.QueryInterface(Ci.calITodo);
                        isTodo = true;
                    } catch {
                        // Not a VTODO.
                    }
                }

                console.log(
                    "WebExtensions: TB Planner: item",
                    totalItems,
                    "type=", itemType,
                    "icalType=", icalType,
                    "isTodo=", isTodo,
                    "id=", asString(item.id),
                    "title=", asString(item.title)
                );

                if (isTodo) {
                    todos.push(item);
                }
            }
        }

        console.log(
            "WebExtensions: TB Planner: getAllTodos() COMPLETE",
            "batches=", batchNumber,
            "totalItems=", totalItems,
            "todos=", todos.length
        );

        return todos;
    } catch (error) {
        console.error(
            "WebExtensions: TB Planner: getAllTodos() ERROR:",
            error
        );
        throw error;
    }
}

function getTodo(calendar, itemId) {
    return new Promise((resolve, reject) => {
        let found = false;

        const listener = {
            QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),

            onGetResult(calendar, itemType, count, items) {
                if (items.length && !found) {
                    found = true;
                    resolve(items[0]);
                }
            },

            onOperationComplete(calendar, status) {
                if (!isSuccessStatus(status) && !found) {
                    reject(new Error(`Task konnte nicht geladen werden: ${status}`));
                } else if (!found) {
                    reject(new Error(`Task nicht gefunden: ${itemId}`));
                }
            }
        };

        calendar.getItem(itemId, listener);
    });
}

function modifyItem(calendar, oldItem, mutate) {
    const item = oldItem.clone();
    mutate(item);

    return new Promise((resolve, reject) => {
        const listener = {
            QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
            onGetResult() {},
            onOperationComplete(calendar, status) {
                if (isSuccessStatus(status)) {
                    resolve(itemToPlain(calendar, item));
                } else {
                    reject(new Error(`Kalenderänderung fehlgeschlagen: ${status}`));
                }
            }
        };

        calendar.modifyItem(item, oldItem, listener);
    });
}

function addItem(calendar, item) {
    return new Promise((resolve, reject) => {
        const listener = {
            QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
            onGetResult() {},
            onOperationComplete(calendar, status) {
                if (isSuccessStatus(status)) {
                    resolve(itemToPlain(calendar, item));
                } else {
                    reject(new Error(`Task konnte nicht angelegt werden: ${status}`));
                }
            }
        };

        calendar.addItem(item, listener);
    });
}

function removeItem(calendar, item) {
    return new Promise((resolve, reject) => {
        const listener = {
            QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
            onGetResult() {},
            onOperationComplete(calendar, status) {
                if (isSuccessStatus(status)) {
                    resolve(true);
                } else {
                    reject(new Error(`Task konnte nicht gelöscht werden: ${status}`));
                }
            }
        };

        calendar.deleteItem(item, listener);
    });
}

var tbPlannerCalendar =
    class extends ExtensionCommon.ExtensionAPI {
        getAPI(context) {
            console.log("WebExtensions: TB Planner Experiment: getAPI()");

            return {
                tbPlannerCalendar: {
                    async ping() {
                        return "pong";
                    },

                    async listCalendars() {
                        console.log("WebExtensions: TB Planner: listCalendars() START");
                        const result = cal.manager.getCalendars().map(calendar => ({
                            id: asString(calendar.id),
                            name: asString(calendar.name),
                            type: asString(calendar.type),
                            readOnly: !!calendar.readOnly
                        }));
                        console.log(
                            "WebExtensions: TB Planner: listCalendars() RETURN",
                            result.length,
                            JSON.stringify(result)
                        );
                        return result;
                    },

                    async listItems(calendarId) {
                        console.log(
                            "WebExtensions: TB Planner: listItems() START",
                            "calendarId=", calendarId,
                            "type=", typeof calendarId
                        );

                        const calendar = getCalendar(calendarId);
                        console.log(
                            "WebExtensions: TB Planner: listItems() calendar found",
                            calendar.id,
                            calendar.name
                        );

                        const items = await getAllTodos(calendar);
                        console.log(
                            "WebExtensions: TB Planner: listItems() getAllTodos returned",
                            items.length
                        );

                        const result = items.map(item => itemToPlain(calendar, item));
                        console.log(
                            "WebExtensions: TB Planner: listItems() plain result",
                            result.length
                        );

                        // Explicit JSON round-trip catches non-cloneable values
                        // before they cross the experiment/WebExtension boundary.
                        const cloneSafeResult = JSON.parse(JSON.stringify(result));
                        console.log(
                            "WebExtensions: TB Planner: listItems() RETURN",
                            cloneSafeResult.length
                        );

                        return cloneSafeResult;
                    },

                    async createTodo({ calendarId, title, startDate, duration }) {
                        const calendar = getCalendar(calendarId);

                        if (calendar.readOnly) {
                            throw new Error("Kalender ist schreibgeschützt.");
                        }

                        const uid = crypto.randomUUID();
                        const todo = cal.createTodo();

                        todo.id = uid;
                        todo.title = asString(title);
                        todo.status = "NEEDS-ACTION";
                        todo.percentComplete = 0;

                        if (startDate) {
                            todo.entryDate = dateFromIcs(startDate);
                            todo.dueDate = dateFromIcs(
                                shiftDateIcs(
                                    startDate,
                                    Math.max(0, Number(duration) - 1)
                                )
                            );
                        }

                        return addItem(calendar, todo);
                    },

                    async updateItem({ calendarId, itemId, wbs, parentId, order }) {
                        const calendar = getCalendar(calendarId);
                        const item = await getTodo(calendar, itemId);

                        return modifyItem(calendar, item, todo => {
                            todo.setProperty("X-TB-PLANNER-WBS", asString(wbs));
                            todo.setProperty("X-TB-PLANNER-PARENT", asString(parentId));
                            todo.setProperty("X-TB-PLANNER-ORDER", String(order ?? 0));
                        });
                    },

                    async deleteItem({ calendarId, itemId }) {
                        const calendar = getCalendar(calendarId);
                        const item = await getTodo(calendar, itemId);
                        return removeItem(calendar, item);
                    },

                    async updateDates({ calendarId, itemId, startDate, endDate }) {
                        const calendar = getCalendar(calendarId);
                        const item = await getTodo(calendar, itemId);

                        return modifyItem(calendar, item, todo => {
                            todo.entryDate =
                                startDate ? dateFromIcs(startDate) : null;
                            todo.dueDate =
                                endDate ? dateFromIcs(endDate) : null;
                        });
                    },

                    async updateTodo({
                        calendarId,
                        itemId,
                        title,
                        description,
                        percentComplete
                    }) {
                        const calendar = getCalendar(calendarId);
                        const item = await getTodo(calendar, itemId);

                        return modifyItem(calendar, item, todo => {
                            todo.title = asString(title);
                            todo.description = asString(description);
                            todo.percentComplete =
                                Number(percentComplete) || 0;
                            todo.status =
                                todo.percentComplete >= 100
                                    ? "COMPLETED"
                                    : "NEEDS-ACTION";
                        });
                    }
                }
            };
        }
    };

this.tbPlannerCalendar = tbPlannerCalendar;
