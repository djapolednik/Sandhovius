"""Een nep-Zigbee2MQTT voor dev/test (puur, zonder MQTT).

Gebruikt door fake-zigbee.py. Bouwt de berichten zoals Zigbee2MQTT 2.x ze
publiceert: zigbee2mqtt/bridge/devices, de events device_joined en
device_interview, de HA-discovery (met identifier zigbee2mqtt_<ieee>, zodat
de agent de HA-entiteit bij het adres vindt) en de stand per apparaat. Zo kan
de hele koppelstroom draaien zonder Zigbee-stick.
"""

KINDS = {
    "light": {
        "type": "Router", "model": "LED1836G9", "vendor": "IKEA",
        "exposes": [
            {"type": "light", "features": [
                {"type": "binary", "name": "state", "property": "state", "value_on": "ON", "value_off": "OFF"},
                {"type": "numeric", "name": "brightness", "property": "brightness", "value_min": 0, "value_max": 254},
                {"type": "numeric", "name": "color_temp", "property": "color_temp", "value_min": 250, "value_max": 454},
            ]},
            {"type": "enum", "name": "effect", "property": "effect", "values": ["blink", "breathe", "okay"]},
            {"type": "numeric", "name": "linkquality", "property": "linkquality"},
        ],
        "state": {"state": "OFF", "brightness": 254, "color_temp": 370},
    },
    "plug2": {
        "type": "Router", "model": "TS011F_2_gang", "vendor": "Tuya",
        "exposes": [
            {"type": "switch", "endpoint": "l1", "features": [
                {"type": "binary", "name": "state", "property": "state_l1", "endpoint": "l1"}]},
            {"type": "switch", "endpoint": "l2", "features": [
                {"type": "binary", "name": "state", "property": "state_l2", "endpoint": "l2"}]},
            {"type": "numeric", "name": "linkquality", "property": "linkquality"},
        ],
        "state": {"state_l1": "OFF", "state_l2": "OFF"},
    },
    "motion": {
        "type": "EndDevice", "model": "RTCGQ11LM", "vendor": "Aqara",
        "exposes": [
            {"type": "binary", "name": "occupancy", "property": "occupancy"},
            {"type": "numeric", "name": "illuminance", "property": "illuminance"},
            {"type": "numeric", "name": "battery", "property": "battery"},
        ],
        "state": {"occupancy": False, "illuminance": 40, "battery": 90},
    },
    "contact": {
        "type": "EndDevice", "model": "MCCGQ11LM", "vendor": "Aqara",
        "exposes": [
            {"type": "binary", "name": "contact", "property": "contact"},
            {"type": "numeric", "name": "battery", "property": "battery"},
        ],
        "state": {"contact": True, "battery": 90},
    },
    # Een radiatorknop (Sonoff TRVZB, een deel van zijn exposes). Verwarming
    # volgens model A: de knop regelt de kamer, de eigen thermostaat de ketel.
    "trv": {
        "type": "EndDevice", "model": "TRVZB", "vendor": "SONOFF",
        "exposes": [
            {"type": "climate", "features": [
                {"type": "numeric", "name": "occupied_heating_setpoint", "property": "occupied_heating_setpoint"},
                {"type": "numeric", "name": "local_temperature", "property": "local_temperature"},
                {"type": "enum", "name": "system_mode", "property": "system_mode", "values": ["off", "auto", "heat"]},
                {"type": "enum", "name": "running_state", "property": "running_state", "values": ["idle", "heat"]},
            ]},
            {"type": "numeric", "name": "battery", "property": "battery"},
            {"type": "numeric", "name": "valve_opening_degree", "property": "valve_opening_degree"},
            {"type": "numeric", "name": "linkquality", "property": "linkquality"},
        ],
        "state": {"system_mode": "heat", "occupied_heating_setpoint": 19, "local_temperature": 18.5,
                  "running_state": "heat", "battery": 90, "valve_opening_degree": 100},
    },
    "leak": {
        "type": "EndDevice", "model": "SJCGQ11LM", "vendor": "Aqara",
        "exposes": [
            {"type": "binary", "name": "water_leak", "property": "water_leak"},
            {"type": "numeric", "name": "battery", "property": "battery"},
        ],
        "state": {"water_leak": False, "battery": 90},
    },
}


def make_device(kind, n):
    """Een apparaat van een soort, met een vast nep-adres per nummer."""
    if kind not in KINDS:
        raise ValueError(f"onbekende soort {kind!r}; kies uit {', '.join(KINDS)}")
    k = KINDS[kind]
    ieee = f"0xfa4e{n:012x}"
    return {
        "ieee_address": ieee, "friendly_name": ieee, "type": k["type"],
        "supported": True, "interview_completed": True,
        "definition": {"model": k["model"], "vendor": k["vendor"], "exposes": k["exposes"]},
        "kind": kind,
    }


def _public(device):
    return {k: v for k, v in device.items() if k != "kind"}


def bridge_devices(devices):
    """De payload van zigbee2mqtt/bridge/devices (retained)."""
    coordinator = {"ieee_address": "0x00124b0000000000", "friendly_name": "Coordinator", "type": "Coordinator",
                   "supported": True, "interview_completed": True, "definition": None}
    return [coordinator] + [_public(d) for d in devices]


def joined_event(device):
    return {"type": "device_joined",
            "data": {"friendly_name": device["friendly_name"], "ieee_address": device["ieee_address"]}}


def interview_event(device):
    return {"type": "device_interview", "data": {
        "friendly_name": device["friendly_name"], "ieee_address": device["ieee_address"],
        "status": "successful", "supported": True, "definition": device["definition"]}}


def _ha_device(device):
    d = device["definition"]
    return {"identifiers": [f"zigbee2mqtt_{device['ieee_address']}"], "name": device["friendly_name"],
            "model": d["model"], "manufacturer": d["vendor"], "via_device": "zigbee2mqtt_bridge_fake"}


def discovery(device):
    """HA-discovery-configs als (topic, config). Sensoren krijgen er geen: de
    agent leest hun stand rechtstreeks van zigbee2mqtt/<naam>."""
    ieee, name = device["ieee_address"], device["friendly_name"]
    base = {"state_topic": f"zigbee2mqtt/{name}", "command_topic": f"zigbee2mqtt/{name}/set",
            "device": _ha_device(device)}
    if device["kind"] == "light":
        return [(f"homeassistant/light/{ieee}/light/config", {
            **base, "name": None, "unique_id": f"{ieee}_light_zigbee2mqtt", "schema": "json",
            "brightness": True, "brightness_scale": 254, "supported_color_modes": ["color_temp"],
        })]
    if device["kind"] == "plug2":
        out = []
        for ep in ("l1", "l2"):
            out.append((f"homeassistant/switch/{ieee}/switch_{ep}/config", {
                **base, "name": ep, "unique_id": f"{ieee}_switch_{ep}_zigbee2mqtt",
                "value_template": "{{ value_json.state_" + ep + " }}",
                "payload_on": '{"state_' + ep + '": "ON"}', "payload_off": '{"state_' + ep + '": "OFF"}',
                "state_on": "ON", "state_off": "OFF",
            }))
        return out
    if device["kind"] == "trv":
        # Alles via .../set met een JSON-sjabloon, zodat apply_set het oppakt.
        return [(f"homeassistant/climate/{ieee}/climate/config", {
            **base, "name": None, "unique_id": f"{ieee}_climate_zigbee2mqtt",
            "current_temperature_topic": base["state_topic"],
            "current_temperature_template": "{{ value_json.local_temperature }}",
            "temperature_state_topic": base["state_topic"],
            "temperature_state_template": "{{ value_json.occupied_heating_setpoint }}",
            "temperature_command_topic": base["command_topic"],
            "temperature_command_template": '{"occupied_heating_setpoint": {{ value }}}',
            "mode_state_topic": base["state_topic"], "mode_state_template": "{{ value_json.system_mode }}",
            "mode_command_topic": base["command_topic"],
            "mode_command_template": '{"system_mode": "{{ value }}"}',
            "modes": ["off", "auto", "heat"], "min_temp": 4, "max_temp": 35, "temp_step": 0.5,
        })]
    return []


def initial_state(device):
    return dict(KINDS[device["kind"]]["state"])


def apply_set(state, payload):
    """Een set-bericht op de stand; effect (knipperen) verandert niets."""
    new = dict(state)
    for key, value in payload.items():
        if key in ("effect", "identify"):
            continue
        new[key] = value
    return new
