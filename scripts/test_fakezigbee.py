import unittest

import fakezigbee as fz


class DeviceTests(unittest.TestCase):
    def test_adres_en_naam(self):
        d = fz.make_device("light", 1)
        self.assertEqual(d["ieee_address"], "0xfa4e000000000001")
        self.assertEqual(d["friendly_name"], d["ieee_address"])
        self.assertTrue(d["supported"])
        self.assertTrue(d["interview_completed"])

    def test_dubbele_stekker_heeft_twee_endpoints(self):
        exposes = fz.make_device("plug2", 2)["definition"]["exposes"]
        switches = [e for e in exposes if e["type"] == "switch"]
        self.assertEqual([e["endpoint"] for e in switches], ["l1", "l2"])
        self.assertEqual([e["features"][0]["property"] for e in switches], ["state_l1", "state_l2"])

    def test_lamp_kan_knipperen(self):
        names = [e.get("name") for e in fz.make_device("light", 1)["definition"]["exposes"]]
        self.assertIn("effect", names)

    def test_sensoren(self):
        def names(kind):
            return {e.get("name") for e in fz.make_device(kind, 3)["definition"]["exposes"]}
        self.assertTrue({"occupancy", "battery"} <= names("motion"))
        self.assertTrue({"contact", "battery"} <= names("contact"))
        self.assertTrue({"water_leak", "battery"} <= names("leak"))

    def test_radiatorknop_is_een_trvzb(self):
        d = fz.make_device("trv", 4)
        self.assertEqual(d["definition"]["model"], "TRVZB")
        names = {e.get("name") for e in d["definition"]["exposes"]}
        self.assertTrue({"valve_opening_degree", "battery"} <= names)
        [(topic, config)] = fz.discovery(d)
        self.assertEqual(topic, f"homeassistant/climate/{d['ieee_address']}/climate/config")
        self.assertEqual(config["device"]["identifiers"], [f"zigbee2mqtt_{d['ieee_address']}"])
        self.assertEqual(config["temperature_command_topic"], f"zigbee2mqtt/{d['friendly_name']}/set")

    def test_onbekende_soort(self):
        with self.assertRaises(ValueError):
            fz.make_device("koffiezetter", 1)


class BridgeTests(unittest.TestCase):
    def test_bridge_devices_begint_met_coordinator(self):
        payload = fz.bridge_devices([fz.make_device("light", 1)])
        self.assertEqual(payload[0]["type"], "Coordinator")
        self.assertEqual(payload[1]["ieee_address"], "0xfa4e000000000001")
        self.assertNotIn("kind", payload[1])

    def test_events_zoals_zigbee2mqtt(self):
        d = fz.make_device("motion", 4)
        joined = fz.joined_event(d)
        self.assertEqual(joined, {"type": "device_joined",
                                  "data": {"friendly_name": d["friendly_name"], "ieee_address": d["ieee_address"]}})
        interview = fz.interview_event(d)
        self.assertEqual(interview["type"], "device_interview")
        self.assertEqual(interview["data"]["status"], "successful")
        self.assertTrue(interview["data"]["supported"])
        self.assertEqual(interview["data"]["definition"]["model"], d["definition"]["model"])


class DiscoveryTests(unittest.TestCase):
    def test_lamp_met_zigbee2mqtt_identifier(self):
        d = fz.make_device("light", 1)
        configs = fz.discovery(d)
        self.assertEqual(len(configs), 1)
        topic, config = configs[0]
        self.assertEqual(topic, "homeassistant/light/0xfa4e000000000001/light/config")
        self.assertEqual(config["device"]["identifiers"], ["zigbee2mqtt_0xfa4e000000000001"])
        self.assertEqual(config["command_topic"], "zigbee2mqtt/0xfa4e000000000001/set")
        self.assertEqual(config["state_topic"], "zigbee2mqtt/0xfa4e000000000001")
        self.assertEqual(config["schema"], "json")

    def test_dubbele_stekker_twee_schakelaars(self):
        configs = fz.discovery(fz.make_device("plug2", 2))
        self.assertEqual([t for t, _ in configs], [
            "homeassistant/switch/0xfa4e000000000002/switch_l1/config",
            "homeassistant/switch/0xfa4e000000000002/switch_l2/config",
        ])
        self.assertEqual(configs[0][1]["name"], "l1")
        self.assertEqual(configs[1][1]["value_template"], "{{ value_json.state_l2 }}")

    def test_sensor_zonder_discovery(self):
        # de agent leest een sensor rechtstreeks van MQTT
        self.assertEqual(fz.discovery(fz.make_device("leak", 5)), [])


class StateTests(unittest.TestCase):
    def test_set_neemt_over(self):
        self.assertEqual(fz.apply_set({"state": "OFF", "brightness": 254}, {"state": "ON", "brightness": 128}),
                         {"state": "ON", "brightness": 128})

    def test_effect_verandert_de_stand_niet(self):
        self.assertEqual(fz.apply_set({"state": "OFF"}, {"effect": "blink"}), {"state": "OFF"})

    def test_endpoint(self):
        self.assertEqual(fz.apply_set({"state_l1": "OFF", "state_l2": "OFF"}, {"state_l2": "ON"}),
                         {"state_l1": "OFF", "state_l2": "ON"})

    def test_beginstand(self):
        self.assertEqual(fz.initial_state(fz.make_device("plug2", 2)), {"state_l1": "OFF", "state_l2": "OFF"})
        self.assertEqual(fz.initial_state(fz.make_device("contact", 3))["contact"], True)


if __name__ == "__main__":
    unittest.main()
