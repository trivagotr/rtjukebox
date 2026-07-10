# Study Game Open-Source Acquisition

## Decision

The Study web client may be GPL-3.0-compatible and will be published as open source. RadioTEDU's university status is not treated as a copyright or license exemption. Every imported package, copied source file, and art asset still requires an origin, exact pin or archive hash, license, notice rule, and modification record.

The v1 production engine is **Phaser 4.2.1 plus Rex Board 4.2.0**. Nitro Renderer, Nitro React, Kaetram, and PhaserQuest remain research/reference sources only. No code or art from those repositories has been copied into product source.

## Evaluation Matrix

| Candidate | Pin | License | Evaluation result | v1 status |
| --- | --- | --- | --- | --- |
| Phaser | `41be1e462bc600064e498cba370bfa8c5c055a22` / `4.2.1` | MIT | Clean isometric spike build and browser render | Selected runtime |
| Rex Board | `12d1ed131105e47515fc429ef0ba8abc93fb025f` / `4.2.0` | MIT | Isometric quad grid rendered with raised platform, blockers, and stairs | Selected grid/path helper |
| Tiled | `8bd35d5100f8f87ade0ad24c9e011a95e5f4c5a2` / `1.12.2` | GPL-2.0 editor | Suitable optional authoring tool; exported RadioTEDU map data remains project-authored | Development tool only |
| Nitro Renderer | `9e9a62385b61957645d0899518a9e1293e865fe8` / `1.6.6` | GPL-3.0 | Source built, but runtime contains no lawful demo assets and requires converted `.nitro` assets plus a hotel WebSocket protocol | Rejected for v1; reference only |
| Nitro React | `75ff874b73d5fc5672a38c536444efa0f0d27e8f` / `2.1.1` | No root license detected | Requires external game data, image libraries, asset conversion, camera endpoints, and WebSocket server | Rejected pending license and infrastructure |
| PixiJS | `497a53ca60e3c46ca01cd3efbb9ca0a4f37e3b10` / `8.19.0` | MIT | Useful renderer benchmark and Nitro context | No direct v1 dependency |
| Kaetram-Open | `4bdbd6d50d36d86f7bff28830945b240f8ab2799` | MPL-2.0 code; mixed assets | Useful social/region architecture; asset and file-level obligations are not needed for v1 | Reference only |
| PhaserQuest | `128fe1051cc056dd60b805a1380e7b257b2e04b3` | MIT code; bundled art unverified | Useful Socket.IO flow reference | Reference only |
| Universal LPC | `72624ebc8c758c6e439aea90ef9a68eb7366a992` | GPL generator; mixed sprite licenses | Hosted generator produced a dressed walking/sitting-capable avatar and exact asset credits | Asset-by-asset research only |
| Kenney Isometric Blocks | archive SHA-256 `018f705cc4bbb8e5c9216e2e6d1f4e0090813de22f314e25a1915484b55b1729` | CC0-1.0 | Lawful room-block source available for spikes or individually tracked imports | Cleared archive; no product files imported yet |

The complete machine-readable ledger is `study-game/THIRD_PARTY.yml`.

## Executed Evidence

- Phaser/Rex research spike: `npm run build` completed with 405 transformed modules. Browser inspection found one 960x680 canvas and the explicit `data-engine-spike="ready"` marker. Screenshot: `docs/study-game/evidence/task-1/phaser-rex-isometric-spike.jpg`.
- Nitro Renderer: `npm run build` completed with 2,716 transformed modules and a 5,145,126-byte `dist` tree. Its clean install reported 8 moderate and 8 high vulnerabilities. No visual demo was launched because the repository ships no lawful room/avatar assets and requires external hotel infrastructure.
- Universal LPC: the pinned hosted generator was exercised in the browser with hair, cardigan, pants, shoes, and hat. Screenshot: `docs/study-game/evidence/task-1/lpc-generator-dressed-avatar.jpg`. Exact selected-layer credits: `docs/study-game/evidence/task-1/lpc-dressed-avatar-credits.json`.
- Universal LPC local checkout: metadata/credit generation succeeded, but the pinned `master` build failed on Windows because generated metadata modules and two Bulma override files were unresolved. The hosted generator worked; the upstream local-build failure is recorded and is one reason not to make the generator a build-time production dependency.
- Kenney archive: downloaded from the official asset page as `application/zip`, 7,288,814 bytes, with the SHA-256 recorded above.

## Asset Policy

1. Do not scrape, download, trace, or redistribute Habbo production assets.
2. Production room and avatar art must be original RadioTEDU-owned work, CC0, or a specifically selected open asset with file-level credits and obligations.
3. Universal LPC is not approved wholesale. A generated sprite may ship only when its exact layers and credits are preserved and the final distribution satisfies every selected license.
4. Unknown-provenance files under the preserved prototype remain quarantined and cannot enter the production asset roots.
5. Any future copied source or asset file must be added to `THIRD_PARTY.yml` before the manifest verifier passes.

## Verification

Run from the repository root:

```text
node --test scripts/verify-third-party.test.mjs
node scripts/verify-third-party.mjs
```

The verifier uses the `yaml` package, accepts exact 40-character git commits or a 64-character SHA-256 for static archives, and rejects untracked production imports.
