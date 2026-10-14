/// <reference path="../pb_data/types.d.ts" />
// Routines: de gesloten lijst, zie automation_rules.js.
onRecordCreateRequest((e) => require(`${__hooks}/automation_rules.js`).check(e), "automations")
onRecordUpdateRequest((e) => require(`${__hooks}/automation_rules.js`).check(e), "automations")
