# LAGAMLESS Pixelcut VTON integration

## Safety / billing

Pixelcut is an **opt-in paid provider**. The frontend does not contain the Pixelcut API key and the provider is disabled unless `VITE_PIXELCUT_VTON_ENABLED=true` is explicitly set.

Pixelcut's current Try-On API is commercial-use enabled according to its API documentation, and the current published Try-On price is 10 credits ($0.10) per image. The endpoint is beta and currently documents person + garment image URLs, with a maximum input size of 25 MB.

## Supabase secret

Set the API key as a Supabase Edge Function secret:

```text
PIXELCUT_API_KEY=<your Pixelcut API key>
```

Do **not** put the key in `.env`, `VITE_*`, React code, or source control.

## Frontend configuration

Add locally:

```text
VITE_PIXELCUT_VTON_ENABLED=true
VITE_PIXELCUT_VTON_TIMEOUT_SECONDS=300
```

Leave the first variable unset/false to keep the paid provider disabled.

## Deploy

Deploy the new Edge Function:

```bash
supabase functions deploy pixelcut-vton
```

The function is admin-only, uploads the two input images to the existing `product-images` bucket under a temporary path, creates short-lived signed URLs for Pixelcut, calls Pixelcut, downloads the result, and deletes the temporary files in `finally`.

## Artwork fidelity pipeline

1. Existing Mockup Studio produces the clean T-shirt input.
2. Pixelcut receives the clean T-shirt and person photo.
3. Pixelcut returns the model wearing the clean garment.
4. `exactArtworkPostComposite.js` re-applies the original DTF source pixels from the existing artwork layers.
5. The resulting PNG is saved as a pending generated model mockup when the product already has a `productId`.
6. Existing generated-mockup approval/order/main controls remain the publishing gate.

The post-compositor deliberately does not claim to infer a hidden cloth mesh. It preserves the original artwork pixels and maps their existing Mockup Studio geometry into the detected VTON garment region. This must be visually tested before production use, especially for sleeves, extreme poses, and heavily rotated artwork.

## Current provider limitation

The Pixelcut adapter is connected for `front` only. A single front person photo cannot honestly be used to fabricate a new back or side pose. Those views remain unsupported until a provider capable of the required view is connected.
