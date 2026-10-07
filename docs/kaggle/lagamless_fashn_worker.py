"""
LAGAMLESS — FASHN VTON 1.5 live worker for Kaggle (T4 GPU).

Run this in a Kaggle notebook (Accelerator: GPU T4, Internet: ON). It loads FASHN VTON 1.5 once, then polls the LAGAMLESS
`vton-worker` Edge Function for jobs created by FIT T-SHIRT TO MODEL, runs
    pipeline(person_image=person, garment_image=garment, category="tops")
and sends the PNG back. It holds NO Supabase key: only the worker token + function URL, stored as Kaggle Secrets.

Kaggle Secrets (Add-ons -> Secrets):
    LAGAMLESS_WORKER_URL    https://<project-ref>.supabase.co/functions/v1/vton-worker
    LAGAMLESS_WORKER_TOKEN  the same value as the Supabase secret VTON_WORKER_TOKEN
"""
import base64, io, os, time, traceback
import requests
from PIL import Image

try:
    from kaggle_secrets import UserSecretsClient
    _s = UserSecretsClient()
    WORKER_URL = _s.get_secret("LAGAMLESS_WORKER_URL")
    WORKER_TOKEN = _s.get_secret("LAGAMLESS_WORKER_TOKEN")
except Exception:  # running outside Kaggle
    WORKER_URL = os.environ["LAGAMLESS_WORKER_URL"]
    WORKER_TOKEN = os.environ["LAGAMLESS_WORKER_TOKEN"]

WEIGHTS_DIR = os.environ.get("FASHN_WEIGHTS_DIR", "/kaggle/working/fashn-vton-1.5/weights")
WORKER_ID = "kaggle-t4"
POLL_SECONDS = 4
MAX_RUNTIME_SECONDS = 11 * 3600  # stop before Kaggle's session limit

HEADERS = {"x-worker-token": WORKER_TOKEN, "content-type": "application/json"}


def call(action, **payload):
    r = requests.post(WORKER_URL, headers=HEADERS, json={"action": action, "workerId": WORKER_ID, **payload}, timeout=120)
    r.raise_for_status()
    return r.json()


def load_image(url):
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    return Image.open(io.BytesIO(r.content)).convert("RGB")


def to_pil(result):
    images = getattr(result, "images", None)
    if images:
        return images[0]
    return result if isinstance(result, Image.Image) else result[0]


def main():
    from fashn_vton import TryOnPipeline  # installed earlier in the notebook, as in the tested setup
    pipeline = TryOnPipeline(weights_dir=WEIGHTS_DIR)
    print("FASHN VTON 1.5 loaded. Waiting for jobs…")
    started = time.time()
    while time.time() - started < MAX_RUNTIME_SECONDS:
        try:
            job = call("claim", info="T4 ready").get("job")
        except Exception as err:
            print("claim failed:", err)
            time.sleep(POLL_SECONDS * 2)
            continue
        if not job:
            time.sleep(POLL_SECONDS)
            continue
        print("job", job["id"], job["view"])
        try:
            person = load_image(job["personUrl"])
            garment = load_image(job["garmentUrl"])
            result = pipeline(person_image=person, garment_image=garment, category=job.get("category") or "tops")
            buf = io.BytesIO()
            to_pil(result).save(buf, format="PNG")
            call("complete", jobId=job["id"], imageBase64=base64.b64encode(buf.getvalue()).decode())
            print("completed", job["id"])
        except Exception as err:
            traceback.print_exc()
            try:
                call("fail", jobId=job["id"], error=str(err)[:280])
            except Exception as err2:
                print("could not report failure:", err2)


if __name__ == "__main__":
    main()
