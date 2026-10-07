import unittest

import fakelights as fl


def light(name):
    return next(l for l in fl.LIGHTS if l["name"] == name)


class DiscoveryTests(unittest.TestCase):
    def test_drie_lampen_met_unieke_id(self):
        self.assertEqual(
            [l["name"] for l in fl.LIGHTS],
            ["Testlamp dimbaar", "Testlamp wit", "Testlamp kleur"],
        )
        ids = [fl.discovery_config(l)["unique_id"] for l in fl.LIGHTS]
        self.assertEqual(len(set(ids)), 3)

    def test_json_schema_en_topics(self):
        for i, l in enumerate(fl.LIGHTS, start=1):
            c = fl.discovery_config(l)
            self.assertEqual(c["schema"], "json")
            self.assertTrue(c["brightness"])
            self.assertTrue(c["color_temp_kelvin"])
            self.assertEqual(c["command_topic"], f"sandhovius_test/{i}/set")
            self.assertEqual(c["state_topic"], f"sandhovius_test/{i}/state")
            self.assertEqual(fl.discovery_topic(l), f"homeassistant/light/sandhovius_test_{i}/config")

    def test_color_modes(self):
        self.assertEqual(fl.discovery_config(light("Testlamp dimbaar"))["supported_color_modes"], ["brightness"])
        self.assertEqual(fl.discovery_config(light("Testlamp wit"))["supported_color_modes"], ["color_temp"])
        self.assertEqual(fl.discovery_config(light("Testlamp kleur"))["supported_color_modes"], ["color_temp", "rgb"])

    def test_kelvinbereik_alleen_bij_wit(self):
        c = fl.discovery_config(light("Testlamp wit"))
        self.assertEqual((c["min_kelvin"], c["max_kelvin"]), (2200, 6500))
        self.assertNotIn("min_kelvin", fl.discovery_config(light("Testlamp dimbaar")))


class ApplyTests(unittest.TestCase):
    def setUp(self):
        self.s = fl.initial_state(light("Testlamp kleur"))

    def test_aan_uit(self):
        on = fl.apply(self.s, {"state": "ON"})
        self.assertEqual(on["state"], "ON")
        self.assertEqual(fl.apply(on, {"state": "OFF"})["state"], "OFF")

    def test_helderheid_en_oorspronkelijke_stand_blijft(self):
        n = fl.apply(self.s, {"state": "ON", "brightness": 102})
        self.assertEqual(n["brightness"], 102)
        self.assertEqual(self.s["state"], "OFF")

    def test_kelvin_en_mireds(self):
        n = fl.apply(self.s, {"state": "ON", "color_temp_kelvin": 3000})
        self.assertEqual((n["color_temp_kelvin"], n["color_mode"]), (3000, "color_temp"))
        m = fl.apply(self.s, {"color_temp": 250})
        self.assertEqual(m["color_temp_kelvin"], 4000)
        # HA stuurt kelvin in color_temp als color_temp_kelvin true staat
        k = fl.apply(self.s, {"color_temp": 5000})
        self.assertEqual(k["color_temp_kelvin"], 5000)

    def test_rgb(self):
        n = fl.apply(self.s, {"state": "ON", "color": {"r": 255, "g": 0, "b": 10}})
        self.assertEqual(n["rgb"], (255, 0, 10))
        self.assertEqual(n["color_mode"], "rgb")

    def test_ongeldig_laat_stand_ongemoeid(self):
        for cmd in [
            {"brightness": 300},
            {"brightness": -1},
            {"brightness": "veel"},
            {"state": "MAYBE"},
            {"color_temp_kelvin": 100},
            {"color": {"r": 256, "g": 0, "b": 0}},
            {"color": {"r": 1}},
            {"state": "ON", "brightness": 999},
            "geen dict",
        ]:
            self.assertEqual(fl.apply(self.s, cmd), self.s, cmd)

    def test_lamp_zonder_vermogen_negeert_kleur(self):
        s = fl.initial_state(light("Testlamp dimbaar"))
        self.assertEqual(fl.apply(s, {"color": {"r": 1, "g": 2, "b": 3}}), s)
        self.assertEqual(fl.apply(s, {"color_temp_kelvin": 3000}), s)
        w = fl.initial_state(light("Testlamp wit"))
        self.assertEqual(fl.apply(w, {"color": {"r": 1, "g": 2, "b": 3}}), w)

    def test_payload(self):
        n = fl.apply(self.s, {"state": "ON", "brightness": 100, "color": {"r": 1, "g": 2, "b": 3}})
        p = fl.state_payload(n)
        self.assertEqual(p["state"], "ON")
        self.assertEqual(p["brightness"], 100)
        self.assertEqual(p["color_mode"], "rgb")
        self.assertEqual(p["color"], {"r": 1, "g": 2, "b": 3})
        self.assertEqual(fl.state_payload(fl.initial_state(light("Testlamp dimbaar"))), {"state": "OFF"})


if __name__ == "__main__":
    unittest.main()
