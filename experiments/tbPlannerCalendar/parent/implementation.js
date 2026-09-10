var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);

var { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

function dateToString(date) {
  if (!date) {
    return null;
  }

  try {
    return date.icalString;
  } catch (error) {
    return null;
  }
}

function itemToPlainObject(item) {

  let type = "unknown";

  if (item.isTodo && item.isTodo()) {
    type = "task";
  } else if (item.isEvent && item.isEvent()) {
    type = "event";
  }

  return {
    id: item.id,
    type: type,

    title: item.title || "",
    description:
      item.getProperty("DESCRIPTION") || "",

    startDate: dateToString(item.startDate),
    endDate: dateToString(item.endDate),

    entryDate: dateToString(item.entryDate),
    dueDate: dateToString(item.dueDate),
    completedDate: dateToString(item.completedDate),

    percentComplete:
      typeof item.percentComplete === "number"
        ? item.percentComplete
        : null,

    status: item.status || "",

    isCompleted:
      typeof item.isCompleted === "boolean"
        ? item.isCompleted
        : null,

    rawStatus:
      item.getProperty("STATUS") || "",

    rawCompleted:
      item.getProperty("COMPLETED") || "",

    calendarId:
      item.calendar
        ? item.calendar.id
        : null,

    // TB Planner WBS-Metadaten
    wbs:
      item.getProperty(
        "X-TB-PLANNER-WBS"
      ) || null,

    parentId:
      item.getProperty(
        "X-TB-PLANNER-PARENT"
      ) || null,

    order:
      Number(
        item.getProperty(
          "X-TB-PLANNER-ORDER"
        ) || 0
      )
  };
}

var tbPlannerCalendar =
  class extends ExtensionCommon.ExtensionAPI {

    getAPI(context) {

      console.log(
        "TB Planner Experiment: getAPI()"
      );

      return {
        tbPlannerCalendar: {

          async ping() {

            console.log(
              "TB Planner Experiment: ping()"
            );

            return "PONG";
          },

          async listCalendars() {

            console.log(
              "TB Planner: listCalendars()"
            );

            const calendars =
              cal.manager.getCalendars();

            return calendars.map(
              calendar => ({
                id:
                  String(calendar.id),

                name:
                  String(calendar.name || ""),

                type:
                  String(calendar.type || ""),

                readOnly:
                  Boolean(calendar.readOnly)
              })
            );
          },

          
async listItems(calendarId) {

            console.log(
              "TB Planner: listItems()",
              calendarId
            );

            const calendar =
              cal.manager.getCalendars().find(
                calendar =>
                  String(calendar.id) ===
                  String(calendarId)
              );

            if (!calendar) {
              throw new Error(
                "Kalender nicht gefunden: " +
                calendarId
              );
            }

            const items =
              await calendar.getItemsAsArray(
                Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
                0,
                null,
                null
              );

            console.log(
              "Thunderbird liefert",
              items.length,
              "Objekte"
            );


            console.log(
              "=== ROHE VTODO-DIAGNOSE ==="
            );

            for (const item of items) {

              if (item.isTodo && item.isTodo()) {

                console.log(
                  "VTODO:",
                  item.title
                );

                console.log(
                  item.icalString
                );
              }
            }

            console.log(
              "=== ROHE VTODO-DIAGNOSE ENDE ==="
            );


            return items.map(
              itemToPlainObject
            );
          },


          // ----------------------------------------------------
          // VTODO ändern
          // ----------------------------------------------------

          // ----------------------------------------------------
          // VTODO-Datum ändern
          // ----------------------------------------------------

          async updateDates(
            calendarId,
            itemId,
            startDate,
            endDate
          ) {

            console.log(
              "TB Planner: updateDates()",
              calendarId,
              itemId,
              startDate,
              endDate
            );


            const calendar =
              cal.manager.getCalendars().find(
                calendar =>
                  calendar.id === calendarId
              );


            if (!calendar) {
              throw new Error(
                "Kalender nicht gefunden: " +
                calendarId
              );
            }


            const oldItem =
              await calendar.getItem(
                itemId
              );


            if (!oldItem) {
              throw new Error(
                "VTODO nicht gefunden: " +
                itemId
              );
            }


            // getItem() liefert ein immutable Item.
            // Deshalb zuerst klonen.
            const item =
              oldItem.clone();


            console.log(
              "UPDATE DATES: VTODO geladen:",
              item.title
            );


            // Vorhandene Thunderbird-Datumsobjekte klonen.
            // Dadurch behalten wir Typ und Zeitzone des VTODO.
            const start =
              item.entryDate
                ? item.entryDate.clone()
                : cal.createDateTime();


            const end =
              item.dueDate
                ? item.dueDate.clone()
                : cal.createDateTime();


            const startYear =
              Number(startDate.slice(0, 4));

            const startMonth =
              Number(startDate.slice(4, 6)) - 1;

            const startDay =
              Number(startDate.slice(6, 8));


            const endYear =
              Number(endDate.slice(0, 4));

            const endMonth =
              Number(endDate.slice(4, 6)) - 1;

            const endDay =
              Number(endDate.slice(6, 8));


            start.resetTo(
              startYear,
              startMonth,
              startDay,
              0,
              0,
              0,
              start.timezone
            );


            end.resetTo(
              endYear,
              endMonth,
              endDay,
              0,
              0,
              0,
              end.timezone
            );


            // VTODO-Daten sind bei uns ganztägige Kalenderdaten.
            // Deshalb ausdrücklich DATE statt DATE-TIME verwenden.
            if (item.isTodo && item.isTodo()) {

              start.isDate =
                true;

              end.isDate =
                true;
            }


            console.log(
              "UPDATE DATES: neue Daten:",
              start.icalString,
              end.icalString
            );


            item.entryDate =
              start;

            item.dueDate =
              end;


            const saved =
              await calendar.modifyItem(
                item,
                oldItem
              );


            console.log(
              "TB Planner: Datum gespeichert:",
              saved.id
            );


            return itemToPlainObject(
              saved
            );
          },

          // ----------------------------------------------------
          // VTODO-Titel und Fortschritt ändern
          // ----------------------------------------------------

          async updateTodo(
            calendarId,
            itemId,
            title,
            description,
            percentComplete
          ) {

            console.log(
              "TB Planner: updateTodo()",
              calendarId,
              itemId,
              title,
              percentComplete
            );


            const calendar =
              cal.manager.getCalendars().find(
                calendar =>
                  calendar.id === calendarId
              );


            if (!calendar) {
              throw new Error(
                "Kalender nicht gefunden: " +
                calendarId
              );
            }


            const oldItem =
              await calendar.getItem(
                itemId
              );


            if (!oldItem) {
              throw new Error(
                "VTODO nicht gefunden: " +
                itemId
              );
            }


            // getItem() liefert ein immutable Item.
            const item =
              oldItem.clone();


            item.title =
              String(title);


            // Beschreibung über die Thunderbird-Eigenschaft setzen.
            // Nicht direkt item.description zuweisen.
            const descriptionText =
              String(description || "");

            if (descriptionText) {
              item.setProperty(
                "DESCRIPTION",
                descriptionText
              );
            } else {
              item.deleteProperty(
                "DESCRIPTION"
              );
            }


            let progress =
              Number(percentComplete);


            if (!Number.isFinite(progress)) {
              progress = 0;
            }


            progress =
              Math.max(
                0,
                Math.min(
                  100,
                  Math.round(progress)
                )
              );


            item.percentComplete =
              progress;


            // VTODO-Fortschritt explizit als iCalendar-Properties setzen.
            // NICHT item.isCompleted = false verwenden:
            // Thunderbird entfernt dabei PERCENT-COMPLETE.

            if (progress >= 100) {

              item.percentComplete =
                100;

              item.status =
                "COMPLETED";

            } else if (progress > 0) {

              item.percentComplete =
                progress;

              item.status =
                "IN-PROCESS";

              item.deleteProperty(
                "COMPLETED"
              );

            } else {

              item.percentComplete =
                0;

              item.status =
                "NEEDS-ACTION";

              item.deleteProperty(
                "COMPLETED"
              );
            }


            console.log(
              "UPDATE TODO:",
              {
                title: item.title,
                percentComplete:
                  item.percentComplete,
                status: item.status
              }
            );


            console.log(
              "=== VTODO RAW VOR SPEICHERN ==="
            );

            console.log(
              item.icalString
            );

            console.log(
              "PROPERTIES:",
              {
                status:
                  item.getProperty("STATUS"),
                percent:
                  item.getProperty("PERCENT-COMPLETE"),
                completed:
                  item.getProperty("COMPLETED"),
                description:
                  item.getProperty("DESCRIPTION")
              }
            );

            console.log(
              "=== VTODO RAW ENDE ==="
            );


            const saved =
              await calendar.modifyItem(
                item,
                oldItem
              );


            console.log(
              "=== VTODO RAW NACH SPEICHERN ==="
            );

            console.log(
              saved.icalString
            );

            console.log(
              "PROPERTIES NACH SPEICHERN:",
              {
                status:
                  saved.getProperty("STATUS"),
                percent:
                  saved.getProperty("PERCENT-COMPLETE"),
                completed:
                  saved.getProperty("COMPLETED"),
                description:
                  saved.getProperty("DESCRIPTION")
              }
            );

            console.log(
              "=== VTODO RAW NACH SPEICHERN ENDE ==="
            );


            console.log(
              "TB Planner: VTODO gespeichert:",
              saved.id
            );


            return itemToPlainObject(
              saved
            );
          },

          async createTodo(
            calendarId,
            title,
            startDate,
            duration
          ) {

            console.log(
              "TB Planner: createTodo() START",
              {
                calendarId,
                title,
                startDate,
                duration
              }
            );


            try {

              // ------------------------------------------------
              // STEP 1: Kalender suchen
              // ------------------------------------------------

              console.log(
                "TB Planner: createTodo() STEP 1 - Kalender suchen"
              );


              const calendars =
                cal.manager.getCalendars();


              console.log(
                "TB Planner: Kalenderanzahl:",
                calendars.length
              );


              const calendar =
                calendars.find(
                  calendar =>
                    calendar.id === calendarId
                );


              if (!calendar) {

                throw new Error(
                  "Kalender nicht gefunden: " +
                  calendarId
                );

              }


              console.log(
                "TB Planner: STEP 2 - Kalender gefunden:",
                {
                  id: calendar.id,
                  name: calendar.name,
                  readOnly: calendar.readOnly
                }
              );


              if (calendar.readOnly) {

                throw new Error(
                  "Kalender ist schreibgeschützt: " +
                  calendarId
                );

              }


              // ------------------------------------------------
              // STEP 3: Parameter prüfen
              // ------------------------------------------------

              console.log(
                "TB Planner: STEP 3 - Parameter prüfen"
              );


              const normalizedTitle =
                String(title ?? "").trim();


              const normalizedStartDate =
                String(startDate ?? "").trim();


              const normalizedDuration =
                Number(duration);


              console.log(
                "TB Planner: Parameter normalisiert:",
                {
                  title: normalizedTitle,
                  startDate: normalizedStartDate,
                  duration: normalizedDuration
                }
              );


              if (!normalizedTitle) {

                throw new Error(
                  "Task-Titel ist leer."
                );

              }


              if (
                !/^\d{8}$/.test(
                  normalizedStartDate
                )
              ) {

                throw new Error(
                  "Ungültiges Startdatum: " +
                  normalizedStartDate +
                  " (erwartet YYYYMMDD)"
                );

              }


              if (
                !Number.isInteger(
                  normalizedDuration
                ) ||
                normalizedDuration < 1
              ) {

                throw new Error(
                  "Ungültige Dauer: " +
                  normalizedDuration
                );

              }


              // ------------------------------------------------
              // STEP 4: Startdatum erzeugen
              // ------------------------------------------------

              console.log(
                "TB Planner: STEP 4 - Startdatum erzeugen"
              );


              const start =
                cal.createDateTime();


              console.log(
                "TB Planner: leeres DateTime erzeugt:",
                start.icalString
              );


              const startYear =
                Number(
                  normalizedStartDate.slice(0, 4)
                );


              const startMonth =
                Number(
                  normalizedStartDate.slice(4, 6)
                ) - 1;


              const startDay =
                Number(
                  normalizedStartDate.slice(6, 8)
                );


              console.log(
                "TB Planner: Startdatum zerlegt:",
                {
                  year: startYear,
                  month: startMonth,
                  day: startDay,
                  timezone:
                    start.timezone
                      ? start.timezone.tzid
                      : null
                }
              );


              start.resetTo(
                startYear,
                startMonth,
                startDay,
                0,
                0,
                0,
                start.timezone
              );


              // VTODO-Datum ausdrücklich als DATE
              // und nicht als DATE-TIME speichern.

              start.isDate =
                true;


              console.log(
                "TB Planner: Startdatum gesetzt:",
                start.icalString
              );


              // ------------------------------------------------
              // STEP 5: Enddatum berechnen
              // ------------------------------------------------

              console.log(
                "TB Planner: STEP 5 - Enddatum berechnen"
              );


              const end =
                start.clone();


              end.addDuration(
                cal.createDuration(
                  "P" + (normalizedDuration - 1) + "D"
                )
              );


              end.isDate =
                true;


              console.log(
                "TB Planner: Enddatum berechnet:",
                {
                  start: start.icalString,
                  end: end.icalString,
                  duration: normalizedDuration
                }
              );


              // ------------------------------------------------
              // STEP 6: VTODO erzeugen
              // ------------------------------------------------

              console.log(
                "TB Planner: STEP 6 - VTODO über XPCOM erzeugen"
              );


              console.log(
                "TB Planner: XPCOM Contract:",
                "@mozilla.org/calendar/todo;1"
              );


              console.log(
                "TB Planner: XPCOM Interface:",
                "calITodo"
              );


              const item =
                Cc["@mozilla.org/calendar/todo;1"]
                  .createInstance(
                    Ci.calITodo
                  );


              console.log(
                "TB Planner: VTODO erzeugt:",
                {
                  id: item.id,
                  isTodo:
                    item.isTodo(),
                  mutable:
                    item.isMutable
                }
              );


              // ------------------------------------------------
              // STEP 7: Eigenschaften setzen
              // ------------------------------------------------

              console.log(
                "TB Planner: STEP 7 - VTODO-Eigenschaften setzen"
              );


              item.title =
                normalizedTitle;


              item.entryDate =
                start;


              item.dueDate =
                end;


              item.percentComplete =
                0;


              console.log(
                "TB Planner: Eigenschaften gesetzt:",
                {
                  title: item.title,
                  entryDate:
                    item.entryDate
                      ? item.entryDate.icalString
                      : null,
                  dueDate:
                    item.dueDate
                      ? item.dueDate.icalString
                      : null,
                  percentComplete:
                    item.percentComplete
                }
              );


              // ------------------------------------------------
              // STEP 8: iCalendar vor Speicherung
              // ------------------------------------------------

              console.log(
                "TB Planner: STEP 8 - VTODO vor addItem()"
              );


              console.log(
                item.icalString
              );


              // ------------------------------------------------
              // STEP 9: VTODO speichern
              // ------------------------------------------------

              console.log(
                "TB Planner: STEP 9 - calendar.addItem()"
              );


              const saved =
                await calendar.addItem(
                  item
                );


              // ------------------------------------------------
              // STEP 10: gespeichertes VTODO prüfen
              // ------------------------------------------------

              console.log(
                "TB Planner: STEP 10 - addItem() erfolgreich"
              );


              console.log(
                "TB Planner: gespeichertes VTODO:",
                {
                  id: saved.id,
                  title: saved.title,
                  entryDate:
                    saved.entryDate
                      ? saved.entryDate.icalString
                      : null,
                  dueDate:
                    saved.dueDate
                      ? saved.dueDate.icalString
                      : null,
                  percentComplete:
                    saved.percentComplete
                }
              );


              console.log(
                "TB Planner: gespeichertes iCalendar:"
              );


              console.log(
                saved.icalString
              );


              // ------------------------------------------------
              // STEP 11: Rückgabe
              // ------------------------------------------------

              const result =
                itemToPlainObject(
                  saved
                );


              console.log(
                "TB Planner: STEP 11 - Rückgabe:",
                result
              );


              return result;


            } catch (error) {

              console.error(
                "TB Planner: createTodo() FEHLER:",
                error
              );


              console.error(
                "TB Planner: Fehlername:",
                error?.name
              );


              console.error(
                "TB Planner: Fehlermeldung:",
                error?.message
              );


              console.error(
                "TB Planner: Fehler-Stack:",
                error?.stack
              );


              throw error;

            }
          },

          
async updateItem(
            calendarId,
            itemId,
            wbs,
            parentId,
            order
          ) {

            const calendars =
              cal.manager.getCalendars();

            const calendar =
              calendars.find(
                calendar =>
                  calendar.id === calendarId
              );

            if (!calendar) {
              throw new Error(
                "Kalender nicht gefunden"
              );
            }

            const oldItem =
              await calendar.getItem(
                itemId
              );

            if (!oldItem) {
              throw new Error(
                "VTODO nicht gefunden"
              );
            }

            // getItem() liefert ein immutable Item.
            const item =
              oldItem.clone();


            // WBS
            if (
              wbs === null ||
              wbs === undefined ||
              wbs === ""
            ) {

              item.deleteProperty(
                "X-TB-PLANNER-WBS"
              );

            } else {

              item.setProperty(
                "X-TB-PLANNER-WBS",
                String(wbs)
              );
            }


            // Parent
            if (
              parentId === null ||
              parentId === undefined ||
              parentId === ""
            ) {

              item.deleteProperty(
                "X-TB-PLANNER-PARENT"
              );

            } else {

              item.setProperty(
                "X-TB-PLANNER-PARENT",
                String(parentId)
              );
            }


            // Reihenfolge
            item.setProperty(
              "X-TB-PLANNER-ORDER",
              String(order ?? 0)
            );


            const saved =
              await calendar.modifyItem(
                item,
                oldItem
              );


            return itemToPlainObject(
              saved
            );
          },

          // ----------------------------------------------------
          // VTODO löschen
          // ----------------------------------------------------

          async deleteItem(
            calendarId,
            itemId
          ) {

            console.log(
              "TB Planner: deleteItem() START",
              {
                calendarId,
                itemId
              }
            );


            try {

              // ------------------------------------------------
              // STEP 1: Kalender suchen
              // ------------------------------------------------

              console.log(
                "TB Planner: deleteItem() STEP 1 - Kalender suchen"
              );


              const calendars =
                cal.manager.getCalendars();


              console.log(
                "TB Planner: Kalenderanzahl:",
                calendars.length
              );


              const calendar =
                calendars.find(
                  calendar =>
                    calendar.id === calendarId
                );


              if (!calendar) {

                throw new Error(
                  "Kalender nicht gefunden: " +
                  calendarId
                );
              }


              console.log(
                "TB Planner: deleteItem() STEP 2 - Kalender gefunden:",
                {
                  id: calendar.id,
                  name: calendar.name,
                  readOnly: calendar.readOnly
                }
              );


              if (calendar.readOnly) {

                throw new Error(
                  "Kalender ist schreibgeschützt: " +
                  calendarId
                );
              }


              // ------------------------------------------------
              // STEP 3: VTODO laden
              // ------------------------------------------------

              console.log(
                "TB Planner: deleteItem() STEP 3 - VTODO laden"
              );


              const item =
                await calendar.getItem(
                  itemId
                );


              if (!item) {

                throw new Error(
                  "VTODO nicht gefunden: " +
                  itemId
                );
              }


              console.log(
                "TB Planner: deleteItem() STEP 4 - VTODO gefunden:",
                {
                  id: item.id,
                  type: item.type,
                  title: item.title,
                  isTodo:
                    item.isTodo
                      ? item.isTodo()
                      : "nicht verfügbar"
                }
              );


              console.log(
                "TB Planner: deleteItem() - VTODO vor Löschen:"
              );


              console.log(
                item.icalString
              );


              // ------------------------------------------------
              // STEP 5: VTODO löschen
              // ------------------------------------------------

              console.log(
                "TB Planner: deleteItem() STEP 5 - calendar.deleteItem()"
              );


              const deleted =
                await calendar.deleteItem(
                  item
                );


              console.log(
                "TB Planner: deleteItem() STEP 6 - Löschen erfolgreich"
              );


              console.log(
                "TB Planner: gelöschte ID:",
                item.id
              );


              console.log(
                "TB Planner: gelöschter Titel:",
                item.title
              );


              console.log(
                "TB Planner: deleteItem() ENDE"
              );


              return {
                id: item.id,
                title: item.title,
                deleted: true
              };


            } catch (error) {

              console.error(
                "TB Planner: deleteItem() FEHLER:",
                error
              );


              console.error(
                "TB Planner: Fehlername:",
                error?.name
              );


              console.error(
                "TB Planner: Fehlermeldung:",
                error?.message
              );


              console.error(
                "TB Planner: Fehler-Stack:",
                error?.stack
              );


              throw error;
            }
          }

        }
      };
    }

    onShutdown(isAppShutdown) {

      if (!isAppShutdown) {

        Services.obs.notifyObservers(
          null,
          "startupcache-invalidate",
          null
        );
      }
    }
  };
