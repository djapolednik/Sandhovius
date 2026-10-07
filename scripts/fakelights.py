"""Stand-logica van de gesimuleerde Zigbee-testlampen (puur, zonder MQTT).

Gebruikt door fake-lights.py. HA's MQTT-JSON-light stuurt commando's als
{"state": "ON", "brightness": 0-255, "color_temp": <kelvin>, "color": {r,g,b}};
we zetten color_temp_kelvin aan, dus color_temp is kelvin. Waarden onder 1000
behandelen we als mireds (zo kan het ook zonder die vlag).
"""

LIGHTS = [
    {"n": 1, "name": "Testlamp dimbaar", "modes": ["brightness"]},
    {"n": 2, "name": "Testlamp wit", "modes": ["color_temp"], "kelvin": (2200, 6500)},
    {"n": 3, "name": "Testlamp kleur", "modes": ["color_temp", "rgb"], "kelvin": (2200, 6500)},
]

DEFAULT_KELVIN = 2700


def discovery_topic(light):
    return f"homeassistant/light/sandhovius_test_{light['n']}/config"


def command_topic(light):
    return f"sandhovius_test/{light['n']}/set"


def state_topic(light):
    return f"sandhovius_test/{light['n']}/state"


def discovery_config(light):
    config = {
        "name": light["name"],
        "unique_id": f"sandhovius_test_{light['n']}",
        "schema": "json",
        "command_topic": command_topic(light),
        "state_topic": state_topic(light),
        "brightness": True,
        "supported_color_modes": list(light["modes"]),
        "color_temp_kelvin": True,
    }
    if "kelvin" in light:
        config["min_kelvin"], config["max_kelvin"] = light["kelvin"]
    return config


def initial_state(light):
    lo, hi = light.get("kelvin", (2200, 6500))
    return {
        "state": "OFF",
        "brightness": 255,
        "color_mode": "color_temp" if "color_temp" in light["modes"] else "brightness",
        "color_temp_kelvin": DEFAULT_KELVIN,
        "rgb": (255, 255, 255),
        "modes": tuple(light["modes"]),
        "kelvin_range": (lo, hi),
    }


def _int(value):
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def apply(state, command):
    """Geeft de nieuwe stand; een ongeldig commando geeft de stand ongewijzigd terug."""
    if not isinstance(command, dict):
        return dict(state)
    new = dict(state)

    if "state" in command:
        if command["state"] not in ("ON", "OFF"):
            return dict(state)
        new["state"] = command["state"]

    if "brightness" in command:
        b = _int(command["brightness"])
        if b is None or not 0 <= b <= 255:
            return dict(state)
        new["brightness"] = b

    kelvin = None
    if "color_temp_kelvin" in command:
        kelvin = _int(command["color_temp_kelvin"])
        if kelvin is None:
            return dict(state)
    elif "color_temp" in command:
        v = _int(command["color_temp"])
        if v is None or v <= 0:
            return dict(state)
        kelvin = round(1_000_000 / v) if v < 1000 else v
    if kelvin is not None:
        lo, hi = state["kelvin_range"]
        if "color_temp" not in state["modes"] or not lo <= kelvin <= hi:
            return dict(state)
        new["color_temp_kelvin"] = kelvin
        new["color_mode"] = "color_temp"

    if "color" in command:
        c = command["color"]
        if "rgb" not in state["modes"] or not isinstance(c, dict):
            return dict(state)
        rgb = [_int(c.get(k)) for k in ("r", "g", "b")]
        if any(x is None or not 0 <= x <= 255 for x in rgb):
            return dict(state)
        new["rgb"] = tuple(rgb)
        new["color_mode"] = "rgb"

    return new


def state_payload(state):
    """JSON-payload voor het state-topic."""
    if state["state"] == "OFF":
        return {"state": "OFF"}
    p = {"state": "ON", "brightness": state["brightness"], "color_mode": state["color_mode"]}
    if state["color_mode"] == "color_temp":
        p["color_temp"] = state["color_temp_kelvin"]
    elif state["color_mode"] == "rgb":
        r, g, b = state["rgb"]
        p["color"] = {"r": r, "g": g, "b": b}
    return p
