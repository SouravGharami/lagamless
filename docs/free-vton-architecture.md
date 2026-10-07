# LAGAMLESS — Free VTON architecture (Step 4)

Goal: put the **exact finished T-shirt** from Mockup Studio onto a **real photo of a person**, using **free** GPU only
(Hugging Face ZeroGPU live, Kaggle in bulk), with no paid API and no fake results.

> **Status honesty.** The code in this repo is tested against an in-process fake Gradio server
> (`node src/admin/components/mockup-v2/human-model/providers/selfTestStep4.mjs`). It has **not** been run against a live
> Hugging Face Space from the build environment (no network). Treat the VTON system as *working* only after you generate one
> real image through your own Space (see §9).

## 1. From Mockup Studio to VTON

1. Admin finishes the T-shirt in **Mockup Studio**. The existing compositor (`finishedTshirtSnapshot.js`, `renderFinalView`) renders each view to a PNG. Nothing new renders the garment.
2. **Human Model** tab → upload a person photo → **USE CURRENT T-SHIRT**. The renders are verified (present, non-empty, not blank) by the Step 3 code.
3. **FIT T-SHIRT TO MODEL** → `planGenerationJobs()` (`human-model/vtonPlanning.js`) creates one job per requested view that (a) the selected provider explicitly supports and (b) has a finished-garment render. Others are listed, not attempted ("This provider does not explicitly support this view.").
4. Jobs go to the queue (`vtonQueue.js`, states QUEUED → SUBMITTING → PROCESSING → COMPLETED / FAILED / CANCELLED). Live providers run one job at a time.
5. The provider returns the normalized result (`{ success, imageUrl, imageBlob, provider, jobId, status, error, usage }`). UI code never sees a provider's native format.
6. The admin **APPROVEs / REJECTs / REGENERATEs**. Only **approve** persists anything: the image is uploaded to the existing `product-images` bucket under `generated-mockups/<product_id>/` and a row is written to `generated_model_mockups` (part-32). The studio render, artwork, product images and `product_mockups` are never modified.
7. Approved mockups get a **main** flag and a manual **priority** (1, 2, 3 … no maximum, stored exactly as ordered). **Add to product images** is an explicit action that uses the existing `productImages.js` (`saveProductImageRecord` / `updateProductImageRecord`).

What the model is asked to do: *fit the supplied garment to the supplied person.* The garment input is the finished render (colour, artwork, placement and counts are in the pixels). Only the transparent background of the garment PNG is flattened to white before upload (most VTON Spaces decode to RGB); the garment pixels are untouched. No prompt, no text-to-image, no redesign.

**Views.** A VTON model keeps the pose of the person photo. The front/back renders are therefore the explicitly supported views (`HF_SUPPORTED_VIEWS`, `KAGGLE_SUPPORTED_VIEWS`); the photo must show the same side as the selected view. 3/4, side and detail are reported as unsupported rather than producing a misleading image.

## 2. Hugging Face ZeroGPU (live)

`providers/huggingFaceZeroGpuProvider.js` + `providers/gradioClient.js` speak the Gradio `/call` protocol (Gradio 4.x/5.x):

`GET /config` (API prefix) → `GET {prefix}/info` (endpoint schema) → `POST {prefix}/upload` ×2 → `POST {prefix}/call/{api}` → `GET {prefix}/call/{api}/{event_id}` (Server-Sent Events: `complete` | `error`) → download the output file.

* The result stream *is* the job channel, so there is **no polling loop** and no percentage. The UI shows `PROCESSING...`.
* Endpoint and inputs are read from the Space's own `/info`. Person vs. garment inputs are matched **by parameter name**; if that is ambiguous the provider stops with "Provider configuration is missing." and asks for `VITE_HF_VTON_PARAM_MAP` — it never guesses, because swapping them would silently produce a wrong image.
* **FASHN VTON compatibility:** intended input is *person image + garment image* (+ category `tops`). Point `VITE_HF_VTON_SPACE_URL` at a FASHN-VTON-compatible Gradio Space you control or have reviewed.
* **Modes.** `direct` (public Space, browser → Space) or `proxy` (private / authenticated Space: browser → `vton-gradio-proxy` Edge Function → Space). Deploy the proxy with:
  ```bash
  supabase secrets set HF_VTON_SPACE_URL=https://<owner>-<space>.hf.space
  supabase secrets set HF_TOKEN=hf_xxx        # optional; fine-grained, read-only
  supabase functions deploy vton-gradio-proxy
  ```
  and set `VITE_HF_VTON_MODE=proxy`. The function requires a signed-in **admin**, calls only the one Space in its secret, and allows only Gradio paths.
* A public Space without a token uses the anonymous ZeroGPU quota, which is small and shared per IP; a token raises it to the token owner's quota.

## 3. Kaggle bulk mode

`providers/kaggleManifest.js` + `KaggleBatchPanel.jsx` + `docs/free-vton-kaggle.md`. Jobs are exported as a ZIP (`manifest.json` + `images/`), run by hand in a Kaggle notebook, and the results (`results.json` + images) are imported back. The job fields are the same normalized fields the live provider receives. No credentials travel in either direction.

## 4. Why Kaggle is not a permanent API

A Kaggle notebook session is started manually, has a weekly GPU allowance and a session time limit, and stops when it finishes. There is no stable endpoint to call, so `kaggleBatchProvider.generate()` never returns an image — it returns `batch_prepared` with `success:false`, and the job stays **QUEUED** until results are imported.

## 5. Usage / quota reporting

`src/services/freeGpuUsage.js` keeps one normalized record per provider and **never invents a number**. Each record is one of:

| Badge | Meaning |
|---|---|
| REAL QUOTA | a figure the provider itself reported (e.g. a ZeroGPU error stating time left) |
| ESTIMATED USAGE | computed from this browser's own records (7-day window); never shown as remaining quota |
| UNKNOWN QUOTA | no figure available |

* Hugging Face exposes no quota API to this app. After a success the status becomes **AVAILABLE** ("Quota information unavailable"); a quota error becomes **EXHAUSTED** (with the time left only if the text contained it).
* Kaggle shows "Configured allowance 30h/week" (from `VITE_KAGGLE_WEEKLY_GPU_HOURS`) labelled *configured, not a quota reading*, and "CHECK KAGGLE". Remaining hours are never calculated.
* **REFRESH USAGE** is rate-limited (15 s) and cached (5 min); for Hugging Face it makes one `GET /config` reachability probe — it reports reachability, not quota.
* After every finished attempt a compact summary is shown; when exhausted the admin is told to use the Kaggle bulk workflow. There is no automatic switch to any other provider.

## 6. Security

* No token, key or secret in React code, `VITE_` variables, `localStorage`, generated URLs or network payloads from the browser. The only things stored client-side are the selected provider id and non-sensitive usage counters.
* Authenticated Spaces go through the Edge Function (secrets in Supabase). `vton-gradio-proxy` is admin-only, fixed-upstream, path-allow-listed, size-limited.
* `providerConfig.findSecretLikeViteVars()` flags secret-looking `VITE_` variables in the configuration panel.
* Kaggle: nothing secret is placed in the notebook (no service-role key). Transfer is manual download/import.
* `generated_model_mockups` is admin-only by RLS; generated files are not public-facing records until promoted.
* Technical errors are logged to the console (`logVtonError`); admins see only the human-readable messages.

## 7. Licensing review (required)

The selected VTON pipeline **and every helper model it loads** (pose/keypoint, human parsing, segmentation, background removal, upscaling) must be reviewed for **commercial** licensing before production use. This repo does not certify any model as commercially cleared and deliberately adds no model itself. Models with non-commercial licenses must not be used for storefront imagery. The same notice is shown in the app (VTON CONFIGURATION).

## 8. Changing providers later

1. Create `providers/<name>Provider.js` returning `{ id, label, mode, supportedViews, isConfigured(), generate() }` (see `vtonProvider.js`; `generate` must return `createProviderResult(...)`).
2. Register it in `providerRegistry.js`. The selector, queue, usage panel and review UI need no change.
3. Add its usage rules to `freeGpuUsage.js` (key in `PROVIDER_KEYS`) — report only figures the provider really returns.
4. Keep it free-first: no paid provider and no automatic paid fallback is part of this design.

## 9. Verifying a real Space

1. Duplicate or choose a FASHN-VTON-compatible Gradio Space; put its URL in `.env` (`VITE_HF_VTON_SPACE_URL`).
2. Open a Space's "Use via API" page and check parameter names; if person/garment are not obviously named, set `VITE_HF_VTON_PARAM_MAP`.
3. In Human Model Studio: upload a front-facing photo, use the finished T-shirt, select **Front**, press **FIT T-SHIRT TO MODEL**.
4. The system is working only if a real image of the person wearing the T-shirt appears under **GENERATED MODEL MOCKUP**.

## 10. Database (part-32)

New admin-only table `generated_model_mockups` (product_id, source_garment_id, human_model_id, provider, provider_job_id, view, status, approved, priority, is_main, image_path/url, promoted_image_id, created_at) plus `set_main_generated_mockup` and `reorder_generated_mockups`. A new table was used because `product_mockups` has `UNIQUE(product_id, view_type)` and `origin IN ('studio','uploaded')` (one studio render per view), and `product_images` is public. No bucket was added and nothing was altered or dropped.

**Known limitation:** the existing product form and storefront read one image per fixed slot (`main`, `model`, …). Extra `model` rows added via "Add to product images" are stored with their priority as `sort_order` but are not shown by today's storefront gallery until it is taught to read several rows of a slot. That storefront change is outside this step.

## Commercial provider boundary — Pixelcut (opt-in)

The project also contains an opt-in `pixelcut_try_on` adapter, but it is disabled by default. The default free development provider is the official FASHN VTON 1.5 Hugging Face ZeroGPU Space. See `docs/free-fashn-vton.md`.
