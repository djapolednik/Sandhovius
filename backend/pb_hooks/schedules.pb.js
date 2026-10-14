/// <reference path="../pb_data/types.d.ts" />
// Schema's: tijd of zon, zie schedule_rules.js.
onRecordCreateRequest((e) => require(`${__hooks}/schedule_rules.js`).check(e), "schedules")
onRecordUpdateRequest((e) => require(`${__hooks}/schedule_rules.js`).check(e), "schedules")
