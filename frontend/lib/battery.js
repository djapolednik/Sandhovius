// Onder deze grens is het tijd voor nieuwe batterijen. Zigbee-sensoren
// melden hun lading in hele procenten.
export const LOW_BATTERY_PERCENT = 20

export function isBatteryLow(battery) {
  return typeof battery === 'number' && battery <= LOW_BATTERY_PERCENT
}
