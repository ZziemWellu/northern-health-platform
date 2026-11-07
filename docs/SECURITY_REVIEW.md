# Dependency security review

Reviewed 5 October 2026. Source: GitHub Dependabot alerts (5 open: 3 high, 2 moderate) and `npm audit`
run in `cht-app/`.

## Summary

- **No vulnerability reaches production.** `npm audit --omit=dev` reports zero findings.
- All five alerts sit in the CHT **build and test tooling**: `cht-conf` (form and configuration tooling) and
  `cht-conf-test-harness` (automated tests and a headless browser). They run on developers' machines and in CI.
- **Three of the five have no patched version on npm yet**, so they cannot be fixed by upgrading.
- `npm audit` over all dependencies reports 12 findings (4 moderate, 8 high). GitHub tracks five of them.

## Each alert

| Alert | Package | Path | Patched version | Exploitable here? | Decision |
|---|---|---|---|---|---|
| High | braces 3.0.3 (stack exhaustion through nested patterns) | cht-conf → eslint-webpack-plugin → micromatch | none on npm | Only if untrusted glob patterns are parsed. We parse only our own configuration. | Accept risk; revisit when a fixed version exists |
| High | extract-zip 2.0.1 (symlink path traversal on extraction) | cht-conf-test-harness → puppeteer-core 10 | none on npm | Only when extracting an untrusted archive. Chromium is downloaded from Google's own host. | Accept risk; revisit when puppeteer is upgraded |
| High | extract-zip 2.0.1 (arbitrary file write via symlinks) | same as above | none on npm | As above | Accept risk (same decision) |
| Moderate | uuid 3.4.0 (missing buffer bounds check in v3/v5/v6) | nested under request and cht-conf-test-harness | 11.1.1 for the root copy | The vulnerable copies are used with the v4 API only, not with a `buf` argument. | Accept risk; forcing uuid 11 would break `request`, which relies on the old API |
| Moderate | request 2.88.2 (server-side request forgery) | cht-conf → request-promise-native | none (the package is deprecated) | Requests go only to the CHT instance the operator configures. | Accept risk; replace when cht-conf stops depending on it |

## Actions

1. **CI gate (done in this branch):** the build fails if a production dependency has a high or critical
   vulnerability (`npm audit --omit=dev --audit-level=high`). This keeps the deployed code clean and
   the review honest.
2. **Dismiss the five alerts in GitHub, each with a reason** (for example "tolerable risk: development
   tooling only, no patched version"). This is a repository decision and is **not done here**; the project
   owner should confirm it.
3. **Upgrade path:** when `cht-conf` and `cht-conf-test-harness` publish versions that drop these
   dependencies, upgrade and remove the overrides. Re-run this review at each CHT release.
4. **Never ship** the development tooling to a district or to a user device.

## Not covered here

The MAMA-AI services have their own dependency manifests (`services/api-gateway/requirements.txt`,
`apps/mobile-pwa/package.json`, `apps/dashboard/requirements.txt`). Dependabot's five alerts were all in
`cht-app/`, so the MAMA-AI manifests were not part of this review. Run the same audit on them before a pilot.

## Update, 7 November 2026: six development-only alerts fixed

Fixed with version overrides in `cht-app/package.json`; all are development tooling, none reaches a device.

| Package | Was | Now | How |
|---|---|---|---|
| joi (high) | 18.2.9 | 18.3.1 | override (under `cht-conf`) |
| source-map-js (high) | 1.2.1 | 1.2.2 | override (under `svgo`) |
| qs | 6.16.0 | 6.16.1 | override bumped |
| serialize-javascript | 7.0.5 | 7.1.3 | override bumped |
| minimatch | 9.0.9 | 11.0.5 | override scoped to `mocha` (other packages need minimatch 3, which is not affected) |
| glob | 10.5.0 | 14.0.2 | override scoped to `mocha` (glob 7 elsewhere is not affected) |

Upgrading mocha does not help: mocha 12.0.3 still depends on vulnerable minimatch 10 and glob 13.
GitHub auto-dismissed the joi and glob alerts when the repository became public; they are fixed anyway.
`npm audit` still lists the accepted items above (extract-zip, request, uuid), which have no fix on npm.
