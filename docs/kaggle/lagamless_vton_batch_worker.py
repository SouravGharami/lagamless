"""
LAGAMLESS VTON batch worker (Kaggle). Reads manifest.json, runs a VTON model per job, writes results/results.json.

This file intentionally contains NO model and NO secrets. Fill in load_model() and tryon() with a model whose licence
(and every helper model's licence) you have reviewed for commercial use.
"""
import json, os, time, glob

INPUT_DIR = next(iter(glob.glob('/kaggle/input/*/manifest.json')), None)
INPUT_DIR = os.path.dirname(INPUT_DIR) if INPUT_DIR else os.environ.get('LAGAMLESS_BATCH_DIR', '.')
OUT_DIR = '/kaggle/working/results' if os.path.isdir('/kaggle/working') else './results'
os.makedirs(OUT_DIR, exist_ok=True)

MODEL_INFO = {"name": "FILL_ME_IN", "version": "", "license_note": "reviewed for commercial use: NO / YES (fill in)"}


def load_model():
    """Load your reviewed VTON model on the GPU and return it."""
    raise NotImplementedError("Plug in your reviewed VTON model here.")


def tryon(model, person_path, garment_path, garment_type):
    """Return a PIL.Image of the person wearing the garment. The garment must not be redesigned."""
    raise NotImplementedError("Call your VTON model here.")


def main():
    with open(os.path.join(INPUT_DIR, 'manifest.json')) as f:
        manifest = json.load(f)
    assert manifest.get('format') == 'lagamless-vton-batch', 'not a LAGAMLESS batch manifest'
    model = load_model()
    results = []
    for job in manifest['jobs']:
        started = time.time()
        entry = {"jobId": job['jobId'], "productId": job.get('productId'), "view": job['view'],
                 "sourceGarmentId": job.get('metadata', {}).get('compositionId'),
                 "humanModelId": job.get('metadata', {}).get('humanModelId'), "model": MODEL_INFO}
        try:
            image = tryon(model, os.path.join(INPUT_DIR, job['personImage']), os.path.join(INPUT_DIR, job['garmentImage']), job.get('garmentType', 'tops'))
            name = f"{job['jobId']}.png"
            image.save(os.path.join(OUT_DIR, name))
            entry.update(success=True, image=name, gpuSeconds=round(time.time() - started, 1))
        except Exception as err:  # report the failure, never fabricate an image
            entry.update(success=False, error=str(err)[:300])
        results.append(entry)
    with open(os.path.join(OUT_DIR, 'results.json'), 'w') as f:
        json.dump({"format": "lagamless-vton-results", "schemaVersion": 1, "results": results}, f, indent=2)
    print(f"done: {sum(r['success'] for r in results)}/{len(results)} succeeded")


if __name__ == '__main__':
    main()
