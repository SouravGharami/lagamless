# LAGAMLESS free FASHN VTON route

This project is wired to the official FASHN VTON 1.5 Hugging Face ZeroGPU Space for free development/testing. The browser sends:

1. the uploaded person image;
2. the CLEAN base T-shirt image (not the artwork-bearing render);
3. `tops` category and FASHN defaults.

After VTON, LAGAMLESS re-applies the original artwork pixels through `exactArtworkPostComposite.js`.

## Important licensing note

The FASHN VTON 1.5 model repository is Apache-2.0. However, the FASHN Human Parser used by the published pipeline is under the NVIDIA SegFormer license, whose Section 3.3 limits use to non-commercial purposes. Therefore this free route is **not certified for commercial production use**. It is included for development/testing only until a complete commercial-use license chain is independently cleared.

The project therefore does not claim that the free route is commercially cleared. Do not publish a commercial LAGAMLESS service using this route until the dependency license issue is resolved.

## Free runtime caveat

Hugging Face ZeroGPU is shared free compute and can be unavailable or quota-limited. This project reports provider failures honestly and does not fabricate results.

## Paid provider

Pixelcut remains in the codebase as an opt-in adapter but is disabled by default. No Pixelcut API key is required for this free route.
