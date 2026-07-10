# RadioTEDU Seated Avatar Layers

These seated avatar layers are derived from the existing RadioTEDU seated model sprites in `../seated-models/`.

The source sprites match the current generated library room style better than the Universal LPC spike. The extractor keeps the long-term layer contract while avoiding one flat image per outfit combination:

- `body`: legs/base pixels shared by the seated pose.
- `skin`: face and hands.
- `hair`: hair pixels.
- `clothing-*`: outfit-specific shirt/hoodie pixels.
- `hat`: transparent placeholder until a real hat layer is drawn.

Generated directions:

- `seated/north/`
- `seated/north-east/`
- `seated/east/`
- `seated/south-east/`
- `seated/south/`
- `seated/south-west/`
- `seated/west/`
- `seated/north-west/`

Generated clothing variants:

- `classic-shirt`
- `radio-hoodie`
- `night-hoodie`
- `break-shirt`

Regenerate with:

```text
python prototypes/library-study/scripts/build-radiotedu-seated-layers.py
```
