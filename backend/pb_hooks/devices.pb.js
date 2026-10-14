/// <reference path="../pb_data/types.d.ts" />
// Devices: mogelijkheden en "weergeven als lamp" bewaken, zie device_rules.js.
onRecordCreateRequest((e) => require(`${__hooks}/device_rules.js`).check(e), "devices")
onRecordUpdateRequest((e) => require(`${__hooks}/device_rules.js`).check(e), "devices")
