/// <reference path="../pb_data/types.d.ts" />
// Meld dit: zie notification_rules.js.
onRecordCreateRequest((e) => require(`${__hooks}/notification_rules.js`).check(e), "notification_rules")
onRecordUpdateRequest((e) => require(`${__hooks}/notification_rules.js`).check(e), "notification_rules")
