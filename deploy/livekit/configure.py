"""Generate private single-VPS media configuration; no cloud resources are changed."""

import argparse
import ipaddress
import json
import re
import secrets
from pathlib import Path

DEFAULT_OUTPUT = Path(__file__).resolve().parent / "runtime"


def hostname(value: str) -> str:
    value = value.lower()
    labels = value.split(".")
    if (
        len(value) > 253
        or len(labels) < 2
        or any(
            not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
            for label in labels
        )
        or labels[-1].isdigit()
    ):
        raise argparse.ArgumentTypeError(
            "Use a DNS hostname, not a URL, IP address or wildcard."
        )
    return value


def public_ipv4(value: str) -> str:
    try:
        address = ipaddress.IPv4Address(value)
    except ipaddress.AddressValueError as exc:
        raise argparse.ArgumentTypeError("Use the VPS's public IPv4 address.") from exc
    if not address.is_global:
        raise argparse.ArgumentTypeError(
            "The VPS address must be publicly routable IPv4."
        )
    return str(address)


def configuration(
    *,
    media_domain: str,
    turn_domain: str,
    public_ip: str,
    api_key: str,
    api_secret: str,
) -> dict[str, str]:
    # SNI routing matches LiveKit's official single-VM Caddy layer4 deployment.
    caddy = {
        "admin": {"listen": "127.0.0.1:2019"},
        "logging": {"logs": {"default": {"level": "INFO"}}},
        "storage": {"module": "file_system", "root": "/data"},
        "apps": {
            "tls": {"certificates": {"automate": [media_domain, turn_domain]}},
            "layer4": {
                "servers": {
                    "main": {
                        "listen": [":443"],
                        "routes": [
                            {
                                "match": [{"tls": {"sni": [turn_domain]}}],
                                "handle": [
                                    {"handler": "tls"},
                                    {
                                        "handler": "proxy",
                                        "upstreams": [{"dial": ["127.0.0.1:5349"]}],
                                    },
                                ],
                            },
                            {
                                "match": [{"tls": {"sni": [media_domain]}}],
                                "handle": [
                                    {
                                        "handler": "tls",
                                        "connection_policies": [{"alpn": ["http/1.1"]}],
                                    },
                                    {
                                        "handler": "proxy",
                                        "upstreams": [{"dial": ["127.0.0.1:7880"]}],
                                    },
                                ],
                            },
                        ],
                    }
                }
            },
        },
    }
    livekit = {
        "port": 7880,
        "bind_addresses": ["127.0.0.1"],
        "rtc": {
            "tcp_port": 7881,
            "udp_port": 7882,
            "use_external_ip": False,
            "node_ip": public_ip,
        },
        "redis": {"address": "127.0.0.1:6379"},
        "keys": {api_key: api_secret},
        "logging": {"level": "info"},
        "turn": {
            "enabled": True,
            "domain": turn_domain,
            "tls_port": 5349,
            "udp_port": 3478,
            "external_tls": True,
        },
    }
    railway = (
        f"LIVEKIT_URL=wss://{media_domain}\n"
        f"LIVEKIT_API_URL=https://{media_domain}\n"
        f"LIVEKIT_API_KEY={api_key}\n"
        f"LIVEKIT_API_SECRET={api_secret}\n"
    )
    return {
        "caddy.json": json.dumps(caddy, indent=2) + "\n",
        # JSON is a YAML subset and avoids introducing a templating/YAML dependency.
        "livekit.yaml": json.dumps(livekit, indent=2) + "\n",
        "railway.env": railway,
    }


def write_configuration(output: Path, files: dict[str, str]) -> None:
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    for name, content in files.items():
        path = output / name
        with path.open("x", encoding="utf-8") as handle:
            path.chmod(0o600)
            handle.write(content)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media-domain", required=True, type=hostname)
    parser.add_argument("--turn-domain", required=True, type=hostname)
    parser.add_argument("--public-ip", required=True, type=public_ipv4)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if args.media_domain == args.turn_domain:
        parser.error("Media and TURN need distinct DNS hostnames for TLS routing.")
    if args.output.exists():
        parser.error(
            f"{args.output} already exists. Refusing to overwrite credentials; "
            "use a new --output directory for intentional key rotation."
        )
    files = configuration(
        media_domain=args.media_domain,
        turn_domain=args.turn_domain,
        public_ip=args.public_ip,
        api_key=f"forge_{secrets.token_hex(12)}",
        api_secret=secrets.token_hex(32),
    )
    write_configuration(args.output, files)
    print(
        f"Private media configuration written to {args.output}. No services were changed."
    )
    print(
        "Transfer it securely to the VPS; import railway.env only into the Django API service."
    )


if __name__ == "__main__":
    main()
