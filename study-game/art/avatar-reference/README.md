# RadioTEDU avatar turnaround

`radiotedu-turnaround.png` is the canonical visual reference for the Study avatar renderer.
It was generated with OpenAI ImageGen on 2026-07-15, chroma-keyed to transparency, and
then translated into deterministic layered SVG sprites by
`scripts/avatar-reference-renderer.mjs`.

The columns are ordered exactly like the runtime manifest:

1. north / direct rear
2. north-east / rear-right
3. east / right profile
4. south-east / front-right
5. south / direct front
6. south-west / front-left
7. west / left profile
8. north-west / rear-left

The first row is standing and the second row is seated. The generated runtime assets keep
the same teal RadioTEDU hoodie, rear hood seam, cargo silhouette, sneakers, bucket-hat
profile, and genuinely distinct front/rear treatment while remaining layerable for the
wardrobe system.
