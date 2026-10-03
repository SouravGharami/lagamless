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
import base64, gc, io, os, time, traceback
# Must be set BEFORE torch is first imported: lets the T4 (15 GB) reuse fragmented memory instead of failing.
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
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
# The website may send photos up to 2048 px. A T4 runs out of memory on those, and FASHN works at roughly 864x1296 anyway,
# so the longest side is capped here. Raise to 1280 only if jobs finish with memory to spare.
MAX_INPUT_SIDE = int(os.environ.get("FASHN_MAX_INPUT_SIDE", "1024"))
MAX_RUNTIME_SECONDS = 11 * 3600  # stop before Kaggle's session limit

HEADERS = {"x-worker-token": WORKER_TOKEN, "content-type": "application/json"}


def call(action, **payload):
    r = requests.post(WORKER_URL, headers=HEADERS, json={"action": action, "workerId": WORKER_ID, **payload}, timeout=120)
    r.raise_for_status()
    return r.json()


def load_image(url, max_side=None):
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    img = Image.open(io.BytesIO(r.content)).convert("RGB")
    scale = (max_side or MAX_INPUT_SIDE) / max(img.size)
    if scale < 1:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    return img


def free_gpu():
    """Give GPU memory back between jobs (and after a failed one) so one big job cannot poison the next."""
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def to_pil(result):
    images = getattr(result, "images", None)
    if images:
        return images[0]
    return result if isinstance(result, Image.Image) else result[0]


def main():
    from fashn_vton import TryOnPipeline  # installed earlier in the notebook, as in the tested setup
    pipeline = TryOnPipeline(weights_dir=WEIGHTS_DIR)
    try:
        import torch
        print(f"GPU memory in use right after loading: {torch.cuda.memory_allocated() / 2**30:.1f} GiB of {torch.cuda.get_device_properties(0).total_memory / 2**30:.1f} GiB")
    except Exception:
        pass
    print(f"WORKER VERSION 2 (input cap {MAX_INPUT_SIDE}px, OOM retry on)")
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
            import torch
            result = None
            for side in dict.fromkeys([MAX_INPUT_SIDE, 768, 640]):  # on out-of-memory, retry smaller instead of failing the job
                try:
                    person = load_image(job["personUrl"], side)
                    garment = load_image(job["garmentUrl"], side)
                    print(f"  running at max {side}px (person {person.size}, garment {garment.size})")
                    with torch.inference_mode():
                        result = pipeline(person_image=person, garment_image=garment, category=job.get("category") or "tops")
                    break
                except Exception as oom:
                    if "out of memory" not in str(oom).lower():
                        raise
                    print(f"  out of memory at {side}px - freeing GPU and retrying smaller")
                    person = garment = result = None
                    free_gpu()
            if result is None:
                raise RuntimeError("CUDA out of memory even at the smallest size. Restart the Kaggle session and run only the worker.")
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
        finally:
            person = garment = result = None
            free_gpu()


if __name__ == "__main__":
    main()
