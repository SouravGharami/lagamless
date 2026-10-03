# LAGAMLESS build status

- Default VTON route: FASHN VTON 1.5 on our own Kaggle T4 worker via the Supabase job queue (see docs/kaggle-fashn-worker-setup.md). The Hugging Face ZeroGPU provider stays registered but is not the default.
- Paid Pixelcut provider: disabled by default.
- VTON input: clean base T-shirt, never the DTF artwork render.
- Exact DTF artwork: re-applied after VTON by the existing post-compositor.
- Commercial licensing: NOT certified for the free FASHN route because its published human-parser dependency uses the NVIDIA SegFormer license with a non-commercial-use restriction.
- Back/side generation: intentionally disabled for the current single-person-photo flow.
