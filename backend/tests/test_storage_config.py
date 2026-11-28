"""Private object storage configuration: Railway Bucket and the AWS role path."""

from unittest import mock

import pytest

from apps.standards import storage

RAILWAY = {
    "STANDARDS_S3_ENDPOINT": "https://storage.railway.app",
    "STANDARDS_S3_BUCKET": "media-abc",
    "STANDARDS_S3_ACCESS_KEY": "key",
    "STANDARDS_S3_SECRET_KEY": "secret",
    "STANDARDS_S3_REGION": "auto",
}
NONE = dict.fromkeys(RAILWAY, "")


def configure(settings, values, local_root=""):
    for name, value in {**NONE, "STANDARDS_S3_REGION": "auto", **values}.items():
        setattr(settings, name, value)
    settings.STANDARDS_LOCAL_ROOT = local_root


def test_not_configured_without_a_bucket(settings):
    configure(settings, {})
    assert storage.configured() is False


def test_railway_bucket_needs_both_keys(settings):
    configure(settings, RAILWAY)
    assert storage.configured() is True
    configure(settings, {**RAILWAY, "STANDARDS_S3_SECRET_KEY": ""})
    assert storage.configured() is False


def test_aws_s3_may_use_the_task_role(settings):
    configure(settings, {"STANDARDS_S3_BUCKET": "forge-media", "STANDARDS_S3_REGION": "us-east-1"})
    assert storage.configured() is True


def test_railway_client_uses_the_endpoint_path_style_and_static_keys(settings):
    configure(settings, RAILWAY)
    with mock.patch.object(storage.boto3, "client") as make:
        storage.client()
    kwargs = make.call_args.kwargs
    assert kwargs["endpoint_url"] == "https://storage.railway.app"
    assert kwargs["aws_access_key_id"] == "key"
    assert kwargs["aws_secret_access_key"] == "secret"
    config = kwargs["config"]
    assert config.s3["addressing_style"] == "path"
    assert config.signature_version == "s3v4"
    assert config.connect_timeout == 5
    assert config.read_timeout == 20


def test_aws_client_passes_no_static_credentials(settings):
    configure(settings, {"STANDARDS_S3_BUCKET": "forge-media", "STANDARDS_S3_REGION": "us-east-1"})
    with mock.patch.object(storage.boto3, "client") as make:
        storage.client()
    kwargs = make.call_args.kwargs
    assert "aws_access_key_id" not in kwargs
    assert "endpoint_url" not in kwargs
    assert kwargs["region_name"] == "us-east-1"
    assert kwargs["config"].s3["addressing_style"] == "virtual"


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://storage.railway.app",
        "https://user:pw@storage.railway.app",
        "https://storage.railway.app?x=1",
        "storage.railway.app",
    ],
)
def test_endpoint_must_be_credential_free_https(settings, endpoint):
    configure(settings, {**RAILWAY, "STANDARDS_S3_ENDPOINT": endpoint})
    with pytest.raises(storage.StorageUnavailable):
        storage.client()


def test_unconfigured_storage_is_a_503_not_a_crash(settings):
    configure(settings, {})
    with pytest.raises(storage.StorageUnavailable) as raised:
        storage.put("standards/t/p/upload.zip", b"x")
    assert raised.value.status_code == 503
    with pytest.raises(storage.StorageUnavailable):
        storage.get("standards/t/p/upload.zip", limit=10)


@pytest.mark.parametrize(
    "name", ["", "/etc/passwd", "../other", "a/../../b", "a//b", "a\\b", "./x"]
)
def test_keys_refuse_path_tricks(name):
    with pytest.raises(ValueError):
        storage.key_for("lakewood", "pkg", name)


def test_keys_are_scoped_by_tenant_and_package():
    assert storage.key_for("lakewood", "pkg", "files/index.html") == (
        "standards/lakewood/pkg/files/index.html"
    )


def test_local_storage_is_refused_with_debug_off(settings, tmp_path):
    configure(settings, {}, local_root=str(tmp_path))
    settings.DEBUG = False
    with pytest.raises(storage.StorageUnavailable):
        storage.local_root()


def test_get_enforces_its_size_limit(settings, tmp_path):
    configure(settings, {}, local_root=str(tmp_path))
    settings.DEBUG = True
    storage.put("standards/t/p/big.bin", b"x" * 11)
    with pytest.raises(storage.StorageUnavailable, match="exceeds"):
        storage.get("standards/t/p/big.bin", limit=10)
    assert storage.get("standards/t/p/big.bin", limit=11) == b"x" * 11
