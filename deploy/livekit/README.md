# Railway API + self-hosted LiveKit VPS

This deployment keeps Django, Postgres and application Redis on Railway. A
**separate, dedicated Linux VPS** runs LiveKit, a local media Redis, and Caddy's
layer-4 TLS proxy. Browsers send media directly to the VPS.

No LiveKit Cloud account is required. These files do not create a VPS, change DNS,
apply Railway configuration, install Docker or modify a firewall automatically.
Use staging first. Production rollout requires real-network and capacity testing.

## 1. Prepare the host and DNS

- Use a Linux VPS with a stable public IPv4 address, Docker Engine and Docker
  Compose v2 installed. The host-network configuration is **not for macOS,
  Windows, Railway containers or a shared server**.
- An initial evaluation host can start at 4 vCPU / 8 GB RAM with adequate network
  throughput. This is not a sizing guarantee for 21 participants; measure CPU,
  bandwidth and packet loss under the intended teaching workload.
- Reserve two distinct DNS names, for example `video.soteriaforge.com` and
  `turn.soteriaforge.com`. Create DNS-only A records pointing both to the VPS.
  Do not enable a CDN/Cloudflare HTTP proxy. Do not add AAAA records unless you
  separately configure and test IPv6; this template advertises IPv4 only.
- Do not reuse the production media host/credentials for staging. Prepare a
  separate host and hostname pair for each environment.
- These services use host ports 80, 443, 7880, 7881, 7882, 3478, 5349, 6379 and 2019. Check for conflicts before starting; do not stop unrelated services.

Configure both provider and OS firewalls. Keep SSH available before changing
firewall rules; restrict SSH to your administrative IP/network.

| Port     | Exposure            | Purpose                                                      |
| -------- | ------------------- | ------------------------------------------------------------ |
| 80/TCP   | Public              | ACME certificate issuance/renewal                            |
| 443/TCP  | Public              | Caddy: HTTPS/WebSocket signaling and TURN/TLS, routed by SNI |
| 7881/TCP | Public              | WebRTC TCP fallback                                          |
| 7882/UDP | Public              | WebRTC UDP mux                                               |
| 3478/UDP | Public              | Embedded TURN/UDP                                            |
| 7880/TCP | Loopback only       | Unencrypted LiveKit API behind Caddy                         |
| 5349/TCP | Block public access | Internal TURN listener; TLS terminates at Caddy              |
| 6379/TCP | Loopback only       | Local media Redis; not Railway's application Redis           |
| 2019/TCP | Loopback only       | Caddy administration                                         |

No public 50000-60000/UDP range is needed because `rtc.udp_port` selects the UDP
mux. Outbound DNS, HTTPS/ACME and media traffic must be allowed. Do not expose
Redis, Caddy administration or the unencrypted API to the internet.

## 2. Generate private configuration

Run on a trusted development machine or the VPS, with Python 3.10+:

```bash
python3 deploy/livekit/configure.py \
  --media-domain video.soteriaforge.com \
  --turn-domain turn.soteriaforge.com \
  --public-ip YOUR_VPS_PUBLIC_IPV4
```

Replace the example hostnames and IP with your real values. The helper validates
them, generates a unique API key and a random 64-character secret, and creates:

```text
deploy/livekit/runtime/
  caddy.json     TLS certificates and SNI routes
  livekit.yaml   Media, TURN and API credentials (JSON-formatted YAML)
  railway.env   Four variables to import into Railway's Django API service
```

The directory is Git-ignored and mode 0700; files are mode 0600. The helper never
prints credentials and **refuses to overwrite an existing output directory**.
Do not commit, attach, paste into chat, or include these files in CI artifacts.
If using `--output` elsewhere, protect and exclude that location from Git too.

Configure names before running: the same public IP is advertised to WebRTC
clients, and certificates require the two DNS names to resolve correctly.
Changing credentials later requires a coordinated update to both the VPS and
Railway; do not simply rerun the helper over a working deployment.

## 3. Transfer and start on the VPS

Securely transfer `compose.yaml` and the generated `runtime/` directory into a
private directory on the VPS, such as `/opt/forge-media`, preserving permissions.
If transferring as an SSH user, use that user's protected staging directory and
then move the files with sudo. Do not enable root SSH login just for this task.
Keep an encrypted backup of credentials and the Caddy certificate volume.

On the **VPS**, from the directory containing `compose.yaml` and `runtime/`:

```bash
docker compose config --quiet
docker compose pull
docker compose run --rm --no-deps caddy validate --config /etc/caddy.json
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:7880/
docker compose logs --tail=50 caddy livekit
```

Use sudo if required by the host's Docker permissions. The unencrypted local
health endpoint should return `OK`. Wait for Caddy to obtain trusted certificates
for both domains before configuring Railway. ACME issuance requires working DNS
and reachable challenge ports; never bypass certificate validation with `curl -k`.

From outside the VPS:

```bash
curl --fail https://video.soteriaforge.com/
openssl s_client -connect turn.soteriaforge.com:443 \
  -servername turn.soteriaforge.com -verify_return_error </dev/null
```

Use your actual names. HTTPS should return `OK`; the TURN connection should
present a trusted certificate for the TURN name. The TLS check is **not** a TURN
allocation/media test.

## 4. Set Railway variables

In Railway, select the correct **project -> staging environment -> Django API
service**. Import the generated `runtime/railway.env` through the Variables raw
editor. Do not import it into a frontend service or a public Angular environment.

The four variables are:

| Variable             | Value                                         |
| -------------------- | --------------------------------------------- |
| `LIVEKIT_URL`        | `wss://video.YOUR_DOMAIN`                     |
| `LIVEKIT_API_URL`    | `https://video.YOUR_DOMAIN`                   |
| `LIVEKIT_API_KEY`    | Generated API key                             |
| `LIVEKIT_API_SECRET` | Generated secret; never a development default |

The server API URL is public HTTPS here, not a VPS-private/loopback address:
Railway must be able to reach it. Room-management calls are authenticated with
the server-side key. Keep `DJANGO_DEBUG=false`.

[Railway IaC](../../.railway/railway.ts) now preserves all four variable values;
it does not create a LiveKit service on Railway or embed credentials. Set the
variables before planning/applying the IaC. If you already manage the service
through Railway's UI, setting variables and redeploying does not require an IaC
apply.

If using IaC, explicitly verify the linked project/environment, run
`railway config plan`, and review the **entire plan** before any apply. The
existing file also manages databases and source branches; do not approve
unrelated changes just to enable video. This preparation does not run an apply.

Deploy/redeploy the API with the Engage migrations. The existing pre-deploy
command runs migrations as owner and refreshes the runtime role's table grants.
The existing learner app fetches the media endpoint from Django, so no media key
or hostname needs to be compiled into its Angular environment.

## 5. Acceptance checks

1. Sign in as an instructor in the selected tenant; create a classroom in
   `/engage`.
2. Join from two current desktop Chrome browsers on different networks. Verify
   received audio/video, microphone mute, camera off/on, screen sharing and leave.
3. Join as a learner and confirm screen-share controls are absent. A member of
   another tenant must not see or join the room.
4. Inspect the selected WebRTC candidate pair in `chrome://webrtc-internals`.
   Check ordinary UDP connectivity, then use a **controlled test network** that
   blocks UDP and direct media TCP to verify relay through TURN/TLS on port 443.
   Do not change the production VPS firewall to simulate client restrictions.
5. Test denied permissions, interrupted networks, reconnects and leaving while a
   capture permission prompt is open.
6. Load-test 21 participants with your expected camera/screen-share mix, then
   verify a 22nd distinct participant cannot join. Measure CPU, bandwidth,
   packet loss and audio/video quality. Do not equate the configured room limit
   with proven capacity.

Recordings, captions, cohort-specific admission, immediate participant removal,
and highly available media clustering are not included. One VPS is a single
point of failure; `restart: unless-stopped` is restart behavior, not redundancy.
Review the host's data location and education-data requirements before real
learner sessions.

## Operations and rollback

- Compose rotates Docker logs (three 10 MB files per service). Monitor host CPU,
  available memory, bandwidth, disk usage, certificate renewals and media errors.
  Keep logs access-controlled: participant/session identifiers can be sensitive.
- Preserve the `caddy-data` volume across deployments so certificates survive.
  Do **not** run `docker compose down -v` during upgrades.
- Images are pinned. Review upstream releases and test upgrades in staging
  before changing pins. Server restarts interrupt active classrooms.
- If rollout fails, restore the previous Railway media variables and VPS
  configuration/images together. Keep the old credentials securely until
  rollback is no longer needed, then revoke them. Stop services with
  `docker compose stop` only after confirming no live class depends on them.
- Do not attempt to expose this host-network Compose stack as a Railway service.

## Validate deployment files locally

```bash
python3 -m unittest discover -s deploy/livekit -p 'test_*.py' -v
LIVEKIT_DEPLOY_SMOKE=1 python3 -m unittest discover -s deploy/livekit -p 'test_*.py' -v
```

The opt-in check needs Docker and the pinned images. It validates Caddy's actual
configuration and starts the actual LiveKit/Redis images in an isolated container
network without publishing host ports, then removes only its own containers.
It does not issue public certificates, change Railway or prove real-world TURN
connectivity. See [classroom behavior and app tests](../../docs/video-classrooms.md).

Architecture follows LiveKit's official [single-VM deployment](https://docs.livekit.io/transport/self-hosting/vm/)
and [network requirements](https://docs.livekit.io/transport/self-hosting/ports-firewall/).
