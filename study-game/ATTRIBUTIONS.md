# Study Game Third-Party Notices

This is a living release-notice file. The exact machine-readable record is `THIRD_PARTY.yml`. Entries marked reference-only are not included in the Study client.

## Project-Supplied Room Art

The canonical Library and Chim Alan room images were supplied and explicitly approved by the project owner on 2026-07-10. Their exact hashes and generated-cutout lineage are recorded in `docs/study-game/ASSET-PROVENANCE.md`; they are project assets, not third-party dependency art.

## Selected Software

- **Phaser 4.2.1** - MIT. Source: https://github.com/phaserjs/phaser at `41be1e462bc600064e498cba370bfa8c5c055a22`.
- **Rex Board / phaser4-rex-plugins 4.2.0** - MIT. Source: https://github.com/rexrainbow/phaser3-rex-notes at `12d1ed131105e47515fc429ef0ba8abc93fb025f`.
- **Vite 8.1.4** - MIT. Source: https://github.com/vitejs/vite at `d2e467d8b68525ea111d7c3f6bae24ebd7afe672`. Development and build tool.
- **Vitest 4.1.10** - MIT. Source: https://github.com/vitest-dev/vitest at `b60605ca76c44b699d4d9153a5bd658c360c8dee`. Development-only.
- **Playwright 1.61.1** - Apache-2.0. Source: https://github.com/microsoft/playwright at npm source commit `39e3553a4f283a41134d75d7e404484bd9e6865a`. Development-only.
- **TypeScript 7.0.2** - Apache-2.0. Source: https://github.com/microsoft/TypeScript at npm source commit `2bd066d87f5bafd315be9f40889d0a60b9e58e0b`. Development-only.
- **Sharp 0.35.3** - Apache-2.0. Source: https://github.com/lovell/sharp at npm source commit `1018449164723ba0203c1beffaba0e21f7829c18`. Development-only asset generator; bundled libvips notices also apply.
- **Node.js type definitions 26.1.1** - MIT. Source package: https://registry.npmjs.org/@types/node/-/node-26.1.1.tgz, SHA-256 `cb0bc3624d2e6bc233ec332a3aea6ac317c0aadb3301bfb797a34864546c1401`. Development-only.
- **Tiled 1.12.2** - GPL-2.0 editor with file-specific BSD components. Source: https://github.com/mapeditor/tiled at `8bd35d5100f8f87ade0ad24c9e011a95e5f4c5a2`. Optional development tool; not distributed with the client.

## Candidate Art Sources

- **Kenney Isometric Blocks 1.0** - CC0-1.0. Official archive SHA-256: `018f705cc4bbb8e5c9216e2e6d1f4e0090813de22f314e25a1915484b55b1729`. No files have been imported into production yet.
- **Universal LPC Spritesheet Character Generator** - generator code GPL-3.0; sprite layers use mixed CC0, CC-BY, CC-BY-SA, OGA-BY, and GPL licenses. Source pin: `72624ebc8c758c6e439aea90ef9a68eb7366a992`. The research avatar's exact selected-layer credits are in `docs/study-game/evidence/task-1/lpc-dressed-avatar-credits.json`; that avatar is not production-approved by this notice alone.

## Evaluated, Not Included

- **Nitro Renderer 1.6.6** - GPL-3.0. Source pin: `9e9a62385b61957645d0899518a9e1293e865fe8`. No Nitro source or assets are included.
- **Nitro React 2.1.1** - no root license file was detected at pin `75ff874b73d5fc5672a38c536444efa0f0d27e8f`; use is prohibited pending confirmation.
- **Kaetram-Open** - MPL-2.0 code with separately licensed assets. Source pin: `4bdbd6d50d36d86f7bff28830945b240f8ab2799`. No files are included.
- **PhaserQuest** - MIT repository code with separately unverified art/maps. Source pin: `128fe1051cc056dd60b805a1380e7b257b2e04b3`. No files are included.
- **PixiJS 8.19.0** - MIT. Source pin: `497a53ca60e3c46ca01cd3efbb9ca0a4f37e3b10`. No direct dependency is selected.
- **Socket.IO 4.8.3** - MIT. Source pin: `d2d753fed4435015c2d83fe62e676b44e07fa3f7`. Candidate for the future server adapter; not yet included.

## Release Rules

1. Ship the applicable license texts and notices for every bundled dependency.
2. Publish corresponding source and modification records for every GPL-derived module that is distributed.
3. Expose selected art credits from an accessible in-app credits surface and preserve the same data in machine-readable form.
4. Record the origin, pin/hash, copied path, notices, and modifications before importing any third-party file.
5. Run `node scripts/verify-third-party.mjs` before release.
