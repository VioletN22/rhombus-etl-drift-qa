"""Read CSV bytes from a local path, s3://bucket/key or gs://bucket/prefix/.

Cloud SDKs are imported only when a cloud URI is used, so local runs need
neither. Credentials come from the environment only (AWS_* for S3,
GOOGLE_APPLICATION_CREDENTIALS for GCS); a .env file is loaded if present.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Fetched:
    uri: str          # what the user passed
    object: str       # the exact file/object that was read
    data: bytes
    updated: str | None = None


def load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)


def _split(uri: str, scheme: str) -> tuple[str, str]:
    bucket, _, key = uri[len(scheme):].partition("/")
    return bucket, key


def _newest(candidates: list[tuple[str, datetime]], after: datetime | None,
            where: str) -> tuple[str, datetime]:
    """Pick the most recently updated object, optionally only those after `after`."""
    if after:
        candidates = [c for c in candidates if c[1] > after]
    if not candidates:
        suffix = f" updated after {after.isoformat()}" if after else ""
        raise FileNotFoundError(f"no objects under {where}{suffix}")
    return max(candidates, key=lambda c: c[1])


def fetch_s3(uri: str) -> Fetched:
    import boto3  # lazy: only needed for s3:// inputs

    bucket, key = _split(uri, "s3://")
    body = boto3.client("s3").get_object(Bucket=bucket, Key=key)["Body"].read()
    return Fetched(uri, uri, body)


def fetch_gcs(uri: str, after: datetime | None) -> Fetched:
    from google.cloud import storage  # lazy: only needed for gs:// outputs

    bucket_name, prefix = _split(uri, "gs://")
    client = storage.Client()
    if prefix and not prefix.endswith("/"):
        blob = client.bucket(bucket_name).get_blob(prefix)
        if blob is not None:
            return Fetched(uri, f"gs://{bucket_name}/{blob.name}",
                           blob.download_as_bytes(), blob.updated.isoformat())
    blobs = {b.name: b for b in client.list_blobs(bucket_name, prefix=prefix)
             if not b.name.endswith("/")}
    name, updated = _newest([(n, b.updated) for n, b in blobs.items()], after, uri)
    return Fetched(uri, f"gs://{bucket_name}/{name}",
                   blobs[name].download_as_bytes(), updated.isoformat())


def fetch_local(uri: str, after: datetime | None) -> Fetched:
    """A file, or a directory treated like a bucket prefix (newest file wins)."""
    path = Path(uri)
    if path.is_file():
        return Fetched(uri, str(path), path.read_bytes())
    files = [(str(p), datetime.fromtimestamp(p.stat().st_mtime, timezone.utc))
             for p in path.iterdir() if p.is_file() and not p.name.startswith(".")]
    name, updated = _newest(files, after, uri)
    return Fetched(uri, name, Path(name).read_bytes(), updated.isoformat())


def fetch(uri: str, after: datetime | None = None) -> Fetched:
    if uri.startswith("s3://"):
        return fetch_s3(uri)
    if uri.startswith("gs://"):
        return fetch_gcs(uri, after)
    return fetch_local(uri, after)
