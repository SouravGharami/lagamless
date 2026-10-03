# Kaggle batch worker for LAGAMLESS VTON

Kaggle is a **free, manual, bulk** GPU — **not** an always-on API and **not** a permanent server. A notebook session runs only
when you start it, has a weekly GPU allowance and a per-session limit, and ends when it finishes.

## Setup (once)
1. Create a Kaggle account and verify your phone (required for GPU access).
2. Choose a VTON model. **Review the licence of the model and every helper model for commercial use first** — nothing here is certified as cleared.
3. New Notebook → Accelerator **GPU**. Paste `docs/kaggle/lagamless_vton_batch_worker.py` and fill in `load_model()` / `tryon()` with your reviewed model. The script ships with **no model** on purpose.

## Required files
* `lagamless-vton-batch-YYYY-MM-DD.zip` exported from the admin (contains `manifest.json` and `images/`). Upload it to Kaggle as a **private** dataset.
* The worker script above.

## Start a batch
1. Admin → Mockup Studio → Human Model. Select provider **Kaggle Batch (BULK / MANUAL)**, upload the model photo, use the finished T-shirt, select views, press **FIT T-SHIRT TO MODEL**. Each view becomes a QUEUED job (nothing is generated yet).
2. **EXPORT BATCH** → downloads the ZIP. Upload it as a private Kaggle dataset and attach it to the notebook.
3. Run the notebook. It reads `manifest.json`, runs each job, and writes `results/results.json` + one image per successful job.

## Import results
1. Download the notebook output and unzip it locally.
2. Admin → Human Model → **IMPORT RESULTS** → select `results.json` **and** all the result images together.
3. Each imported image appears as a completed job for review: **APPROVE / REJECT**. Approved images are stored as separate generated mockups (never over the original design).
4. Optionally enter the GPU hours Kaggle showed; it is stored only as a local *estimate*.

Result format (`results.json`): `{ "format":"lagamless-vton-results", "schemaVersion":1, "results":[{ "jobId","success","image","error","productId","view","sourceGarmentId","humanModelId","model":{…},"gpuSeconds" }] }`. The worker script copies `productId`, `view`, `sourceGarmentId`, `humanModelId` from the manifest so imports still work after the admin page was reloaded.

## Limitations
* Manual: nothing happens until you run the notebook and import.
* Only front/back views are explicitly supported (a VTON model keeps the pose of the photo).
* Output quality depends entirely on the model you plug in.

## GPU quota
Kaggle's weekly GPU allowance (commonly 30 h, it can change) is shown in the app as a **configured free allowance** (`VITE_KAGGLE_WEEKLY_GPU_HOURS`), never as remaining time. The app does not read your Kaggle quota; open your Kaggle profile to see the real value. Any "estimated local usage" is computed from hours you typed in and is labelled as an estimate.

## Security
* Do **not** put a Supabase service-role key, Hugging Face token or any database secret in the notebook. The workflow needs none: transfer is a manual ZIP download and a manual file import.
* Upload the batch as a **private** dataset (it contains your model photos and unpublished designs).
* Do not make the notebook public while it contains data paths or outputs.
* Delete the dataset when the batch is done.
