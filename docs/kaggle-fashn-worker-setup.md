# FIT TO MODEL — Kaggle FASHN VTON 1.5 worker: setup checklist

FIT TO MODEL uses provider `kaggle_worker` (the default). Flow:

    admin browser -> private Supabase bucket `vton-jobs` + table `vton_jobs`
    Kaggle notebook (docs/kaggle/lagamless_fashn_worker.py) -> Edge Function `vton-worker` -> claims job, runs FASHN, returns PNG
    admin browser -> polls the job row, downloads the result, saves it as a generated model mockup

Hugging Face ZeroGPU is still registered but is never selected by default.

## One-time Supabase setup
1. SQL Editor: run `supabase/part-08b2a-admin-security.sql` (if not already) and then `supabase/part-33-vton-jobs.sql`.
2. Your admin user must have `profiles.role = 'admin'` (the bucket and table are admin-only).
3. Pick a long random string (24+ chars) and set it as a secret, then deploy the function WITHOUT JWT verification
   (the Kaggle notebook authenticates with the worker token, not a Supabase login):

        supabase secrets set VTON_WORKER_TOKEN=<long-random-string>
        supabase functions deploy vton-worker --no-verify-jwt

## Kaggle notebook (each session)
1. Accelerator GPU T4, Internet ON.
2. Add-ons > Secrets:
   * `LAGAMLESS_WORKER_URL`   = `https://<project-ref>.supabase.co/functions/v1/vton-worker`
   * `LAGAMLESS_WORKER_TOKEN` = the same value as `VTON_WORKER_TOKEN`
3. Install FASHN VTON 1.5 and download its weights as in your tested setup, then run
   `docs/kaggle/lagamless_fashn_worker.py`. It prints `FASHN VTON 1.5 loaded. Waiting for jobs…`.

## Website
`.env` needs only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The `VITE_HF_*` variables are not used by this provider.
Never put the worker token or the service-role key in a `VITE_` variable.

## If FIT TO MODEL fails
The message now names the cause:
* "not signed in" -> sign in to the admin panel again.
* "not an admin" -> set `profiles.role = 'admin'` for your user.
* "bucket does not exist" / "vton_jobs table does not exist" -> run `part-33-vton-jobs.sql`.
* Job stays "queued" -> the notebook is not running, or its token/URL secrets are wrong (check the notebook output for `claim failed: 401`).
