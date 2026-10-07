#!/usr/bin/env python3
"""Drie gesimuleerde Zigbee-lampen over MQTT, alleen voor dev/test.

Meldt de lampen via MQTT-discovery aan Home Assistant, houdt hun stand bij en
publiceert die terug op het state-topic (retained), zoals een echte lamp.

  python scripts/fake-lights.py [--host localhost --port 1883] [--remove]

--remove publiceert lege discovery-configs zodat HA de lampen weghaalt.
"""
import argparse
import json
import sys
import time

import paho.mqtt.client as mqtt

import fakelights as fl


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=1883)
    ap.add_argument("--remove", action="store_true", help="haal de lampen uit Home Assistant weg")
    args = ap.parse_args()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.connect(args.host, args.port)

    if args.remove:
        client.loop_start()
        for light in fl.LIGHTS:
            client.publish(fl.discovery_topic(light), "", retain=True).wait_for_publish()
            client.publish(fl.state_topic(light), "", retain=True).wait_for_publish()
        client.loop_stop()
        client.disconnect()
        print("Testlampen verwijderd.")
        return

    states = {l["n"]: fl.initial_state(l) for l in fl.LIGHTS}
    by_topic = {fl.command_topic(l): l for l in fl.LIGHTS}

    def publish_state(light):
        client.publish(fl.state_topic(light), json.dumps(fl.state_payload(states[light["n"]])), retain=True)

    def on_connect(c, userdata, flags, reason, props=None):
        for light in fl.LIGHTS:
            c.publish(fl.discovery_topic(light), json.dumps(fl.discovery_config(light)), retain=True)
            c.subscribe(fl.command_topic(light))
            publish_state(light)
        print("Testlampen aangemeld bij Home Assistant:", ", ".join(l["name"] for l in fl.LIGHTS), flush=True)

    def on_message(c, userdata, msg):
        light = by_topic.get(msg.topic)
        if light is None:
            return
        try:
            command = json.loads(msg.payload)
        except ValueError:
            print(f"Genegeerd (geen JSON): {msg.payload!r}", flush=True)
            return
        states[light["n"]] = fl.apply(states[light["n"]], command)
        publish_state(light)
        print(f"{light['name']}: {command} -> {fl.state_payload(states[light['n']])}", flush=True)

    client.on_connect = on_connect
    client.on_message = on_message
    print("Testlampen draaien; Ctrl+C om te stoppen (lampen blijven in HA staan; --remove haalt ze weg).", flush=True)
    try:
        client.loop_forever()
    except KeyboardInterrupt:
        client.disconnect()


if __name__ == "__main__":
    sys.exit(main())
