import argparse
import json
import os
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path

from configure import configuration, hostname, public_ipv4, write_configuration


class ConfigurationTests(unittest.TestCase):
    def files(self):
        return configuration(
            media_domain="video.example.com",
            turn_domain="turn.example.com",
            public_ip="8.8.8.8",
            api_key="forge_test",
            api_secret="a" * 64,
        )

    def test_api_is_private_and_ice_advertises_public_address(self):
        livekit = json.loads(self.files()["livekit.yaml"])
        self.assertEqual(livekit["bind_addresses"], ["127.0.0.1"])
        self.assertEqual(livekit["port"], 7880)
        self.assertEqual(livekit["rtc"]["node_ip"], "8.8.8.8")
        self.assertFalse(livekit["rtc"]["use_external_ip"])
        self.assertEqual(livekit["rtc"]["udp_port"], 7882)
        self.assertEqual(livekit["rtc"]["tcp_port"], 7881)
        self.assertEqual(livekit["keys"], {"forge_test": "a" * 64})
        self.assertEqual(livekit["redis"]["address"], "127.0.0.1:6379")

    def test_tls_proxy_routes_media_and_turn_on_443(self):
        caddy = json.loads(self.files()["caddy.json"])
        self.assertEqual(
            caddy["apps"]["tls"]["certificates"]["automate"],
            ["video.example.com", "turn.example.com"],
        )
        server = caddy["apps"]["layer4"]["servers"]["main"]
        self.assertEqual(server["listen"], [":443"])
        for route, domain, target in zip(
            server["routes"],
            ["turn.example.com", "video.example.com"],
            ["127.0.0.1:5349", "127.0.0.1:7880"],
            strict=True,
        ):
            self.assertEqual(route["match"], [{"tls": {"sni": [domain]}}])
            self.assertEqual(route["handle"][0]["handler"], "tls")
            self.assertEqual(route["handle"][1]["upstreams"], [{"dial": [target]}])

    def test_turn_terminates_tls_at_proxy(self):
        turn = json.loads(self.files()["livekit.yaml"])["turn"]
        self.assertTrue(turn["enabled"])
        self.assertTrue(turn["external_tls"])
        self.assertEqual(turn["domain"], "turn.example.com")
        self.assertEqual(turn["tls_port"], 5349)
        self.assertEqual(turn["udp_port"], 3478)

    def test_railway_variables_match_media_credentials(self):
        env = dict(
            line.split("=", 1) for line in self.files()["railway.env"].splitlines()
        )
        self.assertEqual(env["LIVEKIT_URL"], "wss://video.example.com")
        self.assertEqual(env["LIVEKIT_API_URL"], "https://video.example.com")
        livekit = json.loads(self.files()["livekit.yaml"])
        self.assertEqual(
            livekit["keys"][env["LIVEKIT_API_KEY"]], env["LIVEKIT_API_SECRET"]
        )

    def test_writes_private_files_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "runtime"
            write_configuration(output, self.files())
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
            for name in self.files():
                self.assertEqual(stat.S_IMODE((output / name).stat().st_mode), 0o600)
            with self.assertRaises(FileExistsError):
                write_configuration(output, self.files())

    def test_only_accepts_dns_hostnames(self):
        self.assertEqual(hostname("VIDEO.Example.COM"), "video.example.com")
        for value in [
            "https://example.com",
            "*.example.com",
            "127.0.0.1",
            "localhost",
            "video.example.com:443",
            "-video.example.com",
            "x\nbad.example.com",
        ]:
            with (
                self.subTest(value=value),
                self.assertRaises(argparse.ArgumentTypeError),
            ):
                hostname(value)

    def test_only_accepts_public_ipv4(self):
        self.assertEqual(public_ipv4("8.8.8.8"), "8.8.8.8")
        for value in ["127.0.0.1", "10.0.0.1", "203.0.113.1", "::1", "not-an-ip"]:
            with (
                self.subTest(value=value),
                self.assertRaises(argparse.ArgumentTypeError),
            ):
                public_ipv4(value)

    def test_cli_generates_strong_secret_without_printing_or_overwriting_it(self):
        script = Path(__file__).with_name("configure.py")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "runtime"
            args = [
                sys.executable,
                str(script),
                "--media-domain",
                "video.example.com",
                "--turn-domain",
                "turn.example.com",
                "--public-ip",
                "8.8.8.8",
                "--output",
                str(output),
            ]
            result = subprocess.run(
                args, check=True, capture_output=True, text=True, timeout=5
            )
            original = (output / "railway.env").read_text()
            env = dict(line.split("=", 1) for line in original.splitlines())
            self.assertEqual(len(env["LIVEKIT_API_SECRET"]), 64)
            self.assertTrue(env["LIVEKIT_API_KEY"].startswith("forge_"))
            self.assertNotIn(env["LIVEKIT_API_SECRET"], result.stdout + result.stderr)
            retry = subprocess.run(
                args, check=False, capture_output=True, text=True, timeout=5
            )
            self.assertNotEqual(retry.returncode, 0)
            self.assertIn("Refusing to overwrite", retry.stderr)
            self.assertEqual((output / "railway.env").read_text(), original)

    def test_cli_rejects_matching_tls_domains_without_writing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "runtime"
            result = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("configure.py")),
                    "--media-domain",
                    "video.example.com",
                    "--turn-domain",
                    "video.example.com",
                    "--public-ip",
                    "8.8.8.8",
                    "--output",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=5,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("distinct DNS hostnames", result.stderr)
            self.assertFalse(output.exists())

    @unittest.skipUnless(
        os.environ.get("LIVEKIT_DEPLOY_SMOKE") == "1", "Opt-in Docker check"
    )
    def test_real_proxy_validation_and_media_server_startup(self):
        root = Path(__file__).resolve().parent
        suffix = uuid.uuid4().hex[:12]
        redis = f"forge-config-redis-{suffix}"
        livekit = f"forge-config-livekit-{suffix}"

        def docker(*args):
            return subprocess.run(
                ["docker", *args],
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
            ).stdout

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "runtime"
            write_configuration(output, self.files())
            config = json.loads(
                docker(
                    "compose",
                    "-f",
                    str(root / "compose.yaml"),
                    "config",
                    "--format",
                    "json",
                )
            )
            services = config["services"]
            docker(
                "run",
                "--rm",
                "-v",
                f"{output / 'caddy.json'}:/etc/caddy.json:ro",
                services["caddy"]["image"],
                "validate",
                "--config",
                "/etc/caddy.json",
            )
            try:
                docker(
                    "run",
                    "-d",
                    "--name",
                    redis,
                    services["redis"]["image"],
                    "redis-server",
                    "--bind",
                    "127.0.0.1",
                    "--save",
                    "",
                )
                docker(
                    "run",
                    "-d",
                    "--name",
                    livekit,
                    "--network",
                    f"container:{redis}",
                    "-v",
                    f"{output / 'livekit.yaml'}:/etc/livekit.yaml:ro",
                    services["livekit"]["image"],
                    "--config",
                    "/etc/livekit.yaml",
                )
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    check = subprocess.run(
                        [
                            "docker",
                            "exec",
                            redis,
                            "wget",
                            "-qO-",
                            "http://127.0.0.1:7880/",
                        ],
                        check=False,
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    if check.returncode == 0:
                        self.assertEqual(check.stdout, "OK")
                        break
                    time.sleep(0.5)
                else:
                    self.fail(
                        f"LiveKit did not become ready:\n{docker('logs', livekit)}"
                    )
                self.assertEqual(
                    docker(
                        "inspect", livekit, "--format", "{{.State.Running}}"
                    ).strip(),
                    "true",
                )
            finally:
                for name in [livekit, redis]:
                    subprocess.run(
                        ["docker", "rm", "-f", name],
                        check=False,
                        capture_output=True,
                        timeout=15,
                    )


if __name__ == "__main__":
    unittest.main()
