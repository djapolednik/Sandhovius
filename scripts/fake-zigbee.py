#!/usr/bin/env python3
"""Een nep-Zigbee2MQTT over MQTT, alleen voor dev/test (geen Zigbee-stick nodig).

Doet wat de agent van Zigbee2MQTT gebruikt: koppelen open/dicht
(bridge/request/permit_join), apparaten van het netwerk halen
(bridge/request/device/remove), bridge/devices, de events device_joined en
device_interview, HA-discovery voor lampen en stekkers, en set-berichten.

  python scripts/fake-zigbee.py [--host localhost --port 1883]

Een apparaat laten binnenkomen (alleen terwijl koppelen openstaat, dus nadat je
in de app op zoeken tikte):

  mosquitto_pub -t fake/zigbee/join -m '{"kind":"light"}'

Soorten: light, plug2 (dubbele stekker), motion, contact, leak. Een sensor iets
laten melden: mosquitto_pub -t zigbee2mqtt/<adres> -m '{"water_leak":true}'.
De apparaten blijven bewaard in scripts/.fake-zigbee.json.
"""
import argparse
import json
import os
import sys
import threading
import time

import paho.mqtt.client as mqtt

import fakezigbee as fz

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".fake-zigbee.json")


def load():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data["devices"], {k: v for k, v in data["states"].items()}, data["next"]
    except (OSError, ValueError, KeyError):
        return [], {}, 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=1883)
    args = ap.parse_args()

    devices, states, next_n = load()
    lock = threading.Lock()
    join_until = [0.0]
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

    def save():
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"devices": devices, "states": states, "next": next_n}, f, indent=1)

    def pub(topic, payload, retain=False):
        client.publish(topic, json.dumps(payload) if not isinstance(payload, str) else payload, retain=retain)

    def publish_devices():
        pub("zigbee2mqtt/bridge/devices", fz.bridge_devices(devices), retain=True)

    def publish_device(d):
        for topic, config in fz.discovery(d):
            pub(topic, config, retain=True)
        pub(f"zigbee2mqtt/{d['friendly_name']}", states[d["ieee_address"]])

    def join(kind):
        nonlocal next_n
        with lock:
            if time.time() > join_until[0]:
                print("Koppelen staat dicht: tik eerst op zoeken in de app.", flush=True)
                return
            d = fz.make_device(kind, next_n)
            next_n += 1
            devices.append(d)
            states[d["ieee_address"]] = fz.initial_state(d)
            save()
        print(f"{kind} {d['ieee_address']} meldt zich", flush=True)
        pub("zigbee2mqtt/bridge/event", fz.joined_event(d))
        time.sleep(1)  # het interview duurt bij een echt apparaat even
        publish_devices()
        pub("zigbee2mqtt/bridge/event", fz.interview_event(d))
        publish_device(d)

    def remove(ieee):
        with lock:
            gone = [d for d in devices if d["ieee_address"] == ieee]
            devices[:] = [d for d in devices if d["ieee_address"] != ieee]
            states.pop(ieee, None)
            save()
        for d in gone:
            for topic, _ in fz.discovery(d):
                pub(topic, "", retain=True)
            pub("zigbee2mqtt/bridge/event", {"type": "device_leave", "data": {"ieee_address": ieee, "friendly_name": ieee}})
        publish_devices()
        pub("zigbee2mqtt/bridge/response/device/remove", {"status": "ok" if gone else "error", "data": {"id": ieee}})
        print(f"{ieee} van het netwerk gehaald" if gone else f"{ieee} niet gevonden", flush=True)

    def on_connect(c, userdata, flags, reason, props=None):
        for topic in ("zigbee2mqtt/bridge/request/permit_join", "zigbee2mqtt/bridge/request/device/remove",
                      "zigbee2mqtt/+/set", "fake/zigbee/join"):
            c.subscribe(topic)
        pub("zigbee2mqtt/bridge/state", {"state": "online"}, retain=True)
        publish_devices()
        for d in devices:
            publish_device(d)
        print(f"Nep-Zigbee2MQTT draait met {len(devices)} apparaten; Ctrl+C om te stoppen.", flush=True)

    def on_message(c, userdata, msg):
        try:
            payload = json.loads(msg.payload) if msg.payload else {}
        except ValueError:
            print(f"Genegeerd (geen JSON) op {msg.topic}", flush=True)
            return
        if msg.topic == "zigbee2mqtt/bridge/request/permit_join":
            seconds = int(payload.get("time", 0))
            join_until[0] = time.time() + seconds
            pub("zigbee2mqtt/bridge/response/permit_join", {"status": "ok", "data": {"time": seconds}})
            print(f"Koppelen {'open voor ' + str(seconds) + ' s' if seconds else 'dicht'}", flush=True)
        elif msg.topic == "zigbee2mqtt/bridge/request/device/remove":
            threading.Thread(target=remove, args=(payload.get("id", ""),)).start()
        elif msg.topic == "fake/zigbee/join":
            threading.Thread(target=join, args=(payload.get("kind", "light"),)).start()
        elif msg.topic.endswith("/set"):
            name = msg.topic[len("zigbee2mqtt/"):-len("/set")]
            if payload.get("effect") == "blink" or "identify" in payload:
                print(f"{name} knippert", flush=True)
            with lock:
                if name not in states:
                    return
                states[name] = fz.apply_set(states[name], payload)
                save()
            pub(f"zigbee2mqtt/{name}", states[name])

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(args.host, args.port)
    try:
        client.loop_forever()
    except KeyboardInterrupt:
        client.disconnect()


if __name__ == "__main__":
    sys.exit(main())
