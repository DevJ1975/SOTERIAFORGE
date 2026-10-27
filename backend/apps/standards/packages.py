"""Single-SCO imports. XML/ZIP parsing runs in a resource-limited child process."""

import hashlib
import io
import multiprocessing
import posixpath
import resource
import stat
import zipfile
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import unquote, urlsplit
from xml.etree.ElementTree import ParseError

from defusedxml.common import DefusedXmlException
from defusedxml.ElementTree import fromstring

MAX_ZIP = 50_000_000
MAX_EXPANDED = 200_000_000
MAX_FILE = 25_000_000
MAX_FILES = 2000


class InvalidPackage(ValueError):
    pass


def safe_path(value: str) -> str:
    if (
        not value
        or len(value) > 1024
        or "\\" in value
        or "\x00" in value
        or value.startswith("/")
        or ":" in value
        or any(part in {"", ".", ".."} for part in value.split("/"))
        or unquote(value) != value
    ):
        raise InvalidPackage("Package contains an unsafe or encoded path.")
    return value


def inspect_zip(raw: bytes) -> tuple[dict, list[tuple[str, bytes]]]:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_FILES:
                raise InvalidPackage("Package exceeds 2,000 entries.")
            if sum(e.file_size for e in entries) > MAX_EXPANDED:
                raise InvalidPackage("Package exceeds 200 MB expanded.")
            files = {}
            for entry in entries:
                name = safe_path(entry.filename.rstrip("/"))
                if entry.flag_bits & 1 or stat.S_ISLNK(entry.external_attr >> 16):
                    raise InvalidPackage("Encrypted files and symbolic links are unsupported.")
                if entry.is_dir():
                    continue
                if name in files or entry.file_size > MAX_FILE:
                    raise InvalidPackage("Duplicate names or files over 25 MB are unsupported.")
                if entry.file_size > max(1, entry.compress_size) * 200:
                    raise InvalidPackage("Package compression ratio exceeds the allowed limit.")
                files[name] = entry
            manifests = [
                name for name in files if posixpath.basename(name).lower() == "imsmanifest.xml"
            ]
            if len(manifests) != 1 or files[manifests[0]].file_size > 1_000_000:
                raise InvalidPackage("Supply exactly one imsmanifest.xml of at most 1 MB.")
            manifest_name = manifests[0]
            root = fromstring(archive.read(files[manifest_name]))
            if any(
                "{http://www.w3.org/XML/1998/namespace}base" in node.attrib for node in root.iter()
            ):
                raise InvalidPackage("Manifest xml:base is not supported in this release.")

            def local(node):
                return node.tag.rsplit("}", 1)[-1]

            versions = [
                (node.text or "").strip() for node in root.iter() if local(node) == "schemaversion"
            ]
            version = (
                "1.2"
                if versions == ["1.2"]
                else (
                    "2004"
                    if len(versions) == 1
                    and versions[0]
                    in {
                        "2004",
                        "2004 2nd Edition",
                        "2004 3rd Edition",
                        "2004 4th Edition",
                        "CAM 1.3",
                        "1.3",
                    }
                    else ""
                )
            )
            if not version:
                raise InvalidPackage("Only SCORM 1.2 and single-SCO SCORM 2004 are supported.")
            if any(local(node) in {"sequencing", "sequencingCollection"} for node in root.iter()):
                raise InvalidPackage("SCORM 2004 sequencing is not supported in this release.")
            resources = [
                node
                for node in root.iter()
                if local(node) == "resource"
                and any(
                    key.rsplit("}", 1)[-1].lower() == "scormtype" and value.lower() == "sco"
                    for key, value in node.attrib.items()
                )
            ]
            if len(resources) != 1:
                raise InvalidPackage("Only single-SCO packages are supported.")
            items = [node for node in root.iter() if local(node) == "item"]
            if len(items) != 1 or items[0].get("identifierref") != resources[0].get("identifier"):
                raise InvalidPackage("Supply one organization item referencing the single SCO.")
            if any(local(node) == "dependency" for node in resources[0]):
                raise InvalidPackage("Resource dependencies are not supported in this release.")
            href = resources[0].get("href", "")
            parsed = urlsplit(href)
            if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
                raise InvalidPackage("Launch href must be a local path without query or fragment.")
            base = posixpath.dirname(manifest_name)
            launch = posixpath.join(base, safe_path(href))
            if launch not in files:
                raise InvalidPackage("The SCO launch file is missing.")
            titles = [
                node.text.strip() for node in items[0] if local(node) == "title" and node.text
            ]
            contents = [(name, archive.read(entry)) for name, entry in files.items()]
            return {
                "version": version,
                "launch": launch,
                "title": titles[0][:300] if titles else "SCORM",
                "files": {name: len(body) for name, body in contents},
                "sha256": hashlib.sha256(raw).hexdigest(),
            }, contents
    except (zipfile.BadZipFile, DefusedXmlException, ParseError, NotImplementedError) as error:
        raise InvalidPackage("Invalid ZIP or unsafe XML manifest.") from error


def _extract(raw: bytes, directory: str, sender) -> None:
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
        # macOS does not reliably support address-space limits; production worker is Linux.
        import sys

        if sys.platform == "linux":
            resource.setrlimit(resource.RLIMIT_AS, (768_000_000, 768_000_000))
        metadata, files = inspect_zip(raw)
        for name, body in files:
            path = Path(directory) / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        sender.send(("ready", metadata))
    except (InvalidPackage, ValueError, OSError, RuntimeError) as error:
        sender.send(("failed", str(error)[:300]))
    finally:
        sender.close()


@contextmanager
def extract_isolated(raw: bytes):
    """Yield parsed metadata and a temporary directory, removed after upload."""
    with TemporaryDirectory(prefix="forge-scorm-") as directory:
        context = multiprocessing.get_context("spawn")
        receiver, sender = context.Pipe(duplex=False)
        process = context.Process(target=_extract, args=(raw, directory, sender))
        process.start()
        sender.close()
        try:
            if not receiver.poll(30):
                raise InvalidPackage("Package extraction exceeded 30 seconds.")
            try:
                status, metadata = receiver.recv()
            except EOFError as error:
                raise InvalidPackage("Package extraction worker stopped unexpectedly.") from error
            if status != "ready":
                raise InvalidPackage(metadata)
            yield metadata, Path(directory)
        finally:
            receiver.close()
            if process.is_alive():
                process.terminate()
            process.join(timeout=5)
            if process.is_alive():
                process.kill()
                process.join()
