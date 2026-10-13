# Store Recovery

Use this reference for a failed store submission or an explicitly requested Firefox-only code hotfix. Read the current `.github/workflows/release.yml` inputs and failed run before choosing a recovery path. Apply the authorization boundaries in [SKILL.md](../SKILL.md).

## Establish the failed stage

Inspect the run and existing release with `gh run view {RUN_ID} --log-failed` and `gh release view "v{VERSION}" --json assets`. Verify the version and affected store; a later Chrome or Edge failure does not undo an existing GitHub Release or AMO submission. Firefox signing can be quiet for several minutes; wait for an actual error before treating it as stuck.

Check only the affected store's secret names with `gh secret list`, never their values:

- Chrome: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.
- Edge: `EDGE_CLIENT_ID`, `EDGE_PRODUCT_ID`, `EDGE_API_KEY`.
- Firefox: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`, and for a code hotfix `VOYAGER_FIREFOX_OAUTH_CLIENT_SECRET` (the hotfix build fails without it).

## Chrome or Edge submission retry

These paths reuse `voyager-chrome-v{VERSION}.zip` from the existing GitHub Release, remove the development key, and submit to the selected store. Confirm that asset exists and is the intended version. Do not bump, rebuild, or create another tag for a submission failure.

Run `release.yml` with `version={VERSION}` and exactly the requested store flag:

- Chrome: `publish_only=true`.
- Edge: `publish_edge_only=true`.

Leave unrelated publish flags false. Reuse existing retry authorization for that version and store. A diagnosis alone does not authorize submission.

## Firefox-only code hotfix

For an urgent Firefox-only code hotfix, keep the shared three-part product version unchanged and run `release.yml` from `main` with a four-part version (for example `version=1.6.0.1`) and `publish_firefox_only=true`. Leave the other publish flags false. Verify the intended fix is on `main`, its applicable code checks pass, and the corresponding three-part GitHub Release exists before dispatch.

This path builds only `dist_firefox`, injects the override into its manifest, runs the privacy scan, signs/submits to AMO, retains the signed XPI as a workflow artifact, and replaces the Firefox XPI on the matching three-part GitHub Release. Authorization must cover both AMO submission and this asset replacement.

The release asset keeps its existing three-part filename so direct-download links remain stable, while the signed manifest contains the four-part hotfix version. It creates no shared release tag and does not touch Chrome, Edge, or Safari. The next normal three-part release sorts above it (`1.6.1 > 1.6.0.1`).

## Verify recovery

Monitor the dispatched run and verify the selected store's actual upload/submission result. For a Firefox hotfix, also verify privacy/signing success, the signed XPI artifact, and its replacement on the correct GitHub Release with the expected manifest version. Report submission separately from store approval or availability.

If the same failure recurs, inspect the new evidence and fix the identified cause before retrying; do not repeatedly dispatch unchanged inputs. A Safari build/sign/notarization failure blocks the GitHub Release job and belongs in [safari-dmg.md](safari-dmg.md), not a store-only retry.
