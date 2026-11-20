"""Thin clients for the release and code tools: Railway's GraphQL API and GitHub's REST API.

Tokens are service variables (never in code): RAILWAY_API_TOKEN (an account or
workspace token) and GITHUB_TOKEN (fine-grained, this repo only: Contents and
Pull requests read/write, no Workflows). Missing tokens disable the tools that
need them with a clear message instead of failing at import.
"""

import base64
from typing import Any

import httpx
from django.conf import settings
from django.core.exceptions import ValidationError

TIMEOUT = httpx.Timeout(20.0)


class IntegrationError(ValidationError):
    """Shown to the caller as a tool error."""


# --- Railway -----------------------------------------------------------------

RAILWAY_API = "https://backboard.railway.com/graphql/v2"


def railway(query: str, **variables: Any) -> dict:
    if not settings.RAILWAY_API_TOKEN:
        raise IntegrationError("Release tools are off: set RAILWAY_API_TOKEN on the API service.")
    response = httpx.post(
        RAILWAY_API,
        json={"query": query, "variables": variables},
        headers={"Authorization": f"Bearer {settings.RAILWAY_API_TOKEN}"},
        timeout=TIMEOUT,
    )
    if response.status_code != 200:
        raise IntegrationError(f"Railway API returned HTTP {response.status_code}.")
    body = response.json()
    if body.get("errors"):
        raise IntegrationError(
            "Railway: " + "; ".join(e.get("message", "?") for e in body["errors"])
        )
    return body["data"]


def railway_environment_id(name: str) -> str:
    data = railway(
        "query($id: String!) { project(id: $id) { environments { edges { node { id name } } } } }",
        id=_railway_project(),
    )
    for edge in data["project"]["environments"]["edges"]:
        if edge["node"]["name"] == name:
            return edge["node"]["id"]
    raise IntegrationError(f"No Railway environment named {name!r}.")


def railway_deployments(environment: str, limit: int = 5) -> list[dict]:
    data = railway(
        """query($input: DeploymentListInput!, $first: Int) {
             deployments(input: $input, first: $first) {
               edges { node { id status createdAt staticUrl meta } }
             }
           }""",
        input={
            "projectId": _railway_project(),
            "environmentId": railway_environment_id(environment),
            "serviceId": _railway_service(),
        },
        first=limit,
    )
    deployments = []
    for edge in data["deployments"]["edges"]:
        node = edge["node"]
        meta = node.get("meta") or {}
        deployments.append(
            {
                "id": node["id"],
                "status": node["status"],
                "createdAt": node["createdAt"],
                "url": node.get("staticUrl"),
                "branch": meta.get("branch"),
                "commit": (meta.get("commitHash") or "")[:12] or None,
                "commitMessage": (meta.get("commitMessage") or "").split("\n", 1)[0] or None,
            }
        )
    return deployments


def railway_logs(deployment_id: str, *, build: bool, limit: int) -> list[str]:
    field = "buildLogs" if build else "deploymentLogs"
    data = railway(
        f"query($id: String!, $limit: Int) {{ {field}(deploymentId: $id, limit: $limit) "
        "{ timestamp message severity } }",
        id=deployment_id,
        limit=limit,
    )
    return [
        f"{line['timestamp']} {line.get('severity') or ''} {line['message']}"
        for line in data[field]
    ]


def railway_redeploy(environment: str) -> None:
    railway(
        "mutation($env: String!, $svc: String!) { serviceInstanceRedeploy(environmentId: $env, "
        "serviceId: $svc) }",
        env=railway_environment_id(environment),
        svc=_railway_service(),
    )


def _railway_project() -> str:
    if not settings.RAILWAY_PROJECT_ID:
        raise IntegrationError(
            "RAILWAY_PROJECT_ID isn't set (Railway sets it on deployed services)."
        )
    return settings.RAILWAY_PROJECT_ID


def _railway_service() -> str:
    if not settings.RAILWAY_SERVICE_ID:
        raise IntegrationError(
            "RAILWAY_SERVICE_ID isn't set (Railway sets it on deployed services)."
        )
    return settings.RAILWAY_SERVICE_ID


# --- GitHub ------------------------------------------------------------------

GITHUB_API = "https://api.github.com"


def github(method: str, path: str, **kwargs: Any) -> Any:
    if not settings.GITHUB_TOKEN:
        raise IntegrationError("Code tools are off: set GITHUB_TOKEN on the API service.")
    response = httpx.request(
        method,
        f"{GITHUB_API}/repos/{settings.GITHUB_REPO}{path}",
        headers={
            "Authorization": f"Bearer {settings.GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout=TIMEOUT,
        **kwargs,
    )
    if response.status_code == 404:
        raise IntegrationError(f"Not found on GitHub: {path}")
    if response.status_code >= 400:
        message = response.json().get("message", "") if response.content else ""
        raise IntegrationError(f"GitHub returned HTTP {response.status_code}: {message}")
    return response.json() if response.content else None


def github_read_file(path: str, ref: str) -> dict:
    data = github("GET", f"/contents/{path}", params={"ref": ref})
    if isinstance(data, list):
        return {
            "path": path,
            "ref": ref,
            "entries": [{"name": e["name"], "type": e["type"], "path": e["path"]} for e in data],
        }
    if data.get("encoding") != "base64" or data.get("size", 0) > 400_000:
        raise IntegrationError(f"{path} is too large or not a text file.")
    text = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
    return {"path": path, "ref": ref, "sha": data["sha"], "content": text}


def github_open_pr(*, base: str, branch: str, title: str, body: str, files: list[dict]) -> dict:
    """Commit `files` ({path, content} or {path, delete: True}) on a new branch and open a PR."""
    base_sha = github("GET", f"/git/ref/heads/{base}")["object"]["sha"]
    base_tree = github("GET", f"/git/commits/{base_sha}")["tree"]["sha"]
    tree = []
    for f in files:
        if f.get("delete"):
            tree.append({"path": f["path"], "mode": "100644", "type": "blob", "sha": None})
        else:
            blob = github("POST", "/git/blobs", json={"content": f["content"], "encoding": "utf-8"})
            tree.append({"path": f["path"], "mode": "100644", "type": "blob", "sha": blob["sha"]})
    new_tree = github("POST", "/git/trees", json={"base_tree": base_tree, "tree": tree})["sha"]
    commit = github(
        "POST",
        "/git/commits",
        json={"message": f"{title}\n\n{body}", "tree": new_tree, "parents": [base_sha]},
    )["sha"]
    github("POST", "/git/refs", json={"ref": f"refs/heads/{branch}", "sha": commit})
    pr = github("POST", "/pulls", json={"title": title, "head": branch, "base": base, "body": body})
    return {"number": pr["number"], "url": pr["html_url"], "branch": branch, "base": base}


def github_pr_status(number: int) -> dict:
    pr = github("GET", f"/pulls/{number}")
    checks = github("GET", f"/commits/{pr['head']['sha']}/check-runs")
    return {
        "number": number,
        "title": pr["title"],
        "url": pr["html_url"],
        "state": "merged" if pr.get("merged") else pr["state"],
        "head": pr["head"]["ref"],
        "base": pr["base"]["ref"],
        "mergeable": pr.get("mergeable"),
        "checks": [
            {"name": c["name"], "status": c["status"], "conclusion": c.get("conclusion")}
            for c in checks.get("check_runs", [])
        ],
    }


def github_open_prs(head_prefix: str = "") -> list[dict]:
    prs = github("GET", "/pulls", params={"state": "open", "per_page": 50})
    return [
        {
            "number": p["number"],
            "title": p["title"],
            "head": p["head"]["ref"],
            "base": p["base"]["ref"],
            "url": p["html_url"],
        }
        for p in prs
        if p["head"]["ref"].startswith(head_prefix)
    ]
