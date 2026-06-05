# Publishing Plan — npm + GitHub Releases

This document tracks the steps needed to publish the first release of
`@andersonlimahw/lemon-codegraph` on npm and create the GitHub Release bundles.

Until this is done, users must install via:

```bash
npm install -g github:andersonlimahw/lemon-code-graph
```

---

## Prerequisites

- [ ] npm account at <https://www.npmjs.com> with access to the `@andersonlimahw` org scope
- [ ] `NPM_TOKEN` — a **publish** token from your npm account (Granular: read+write on `@andersonlimahw/*`)
- [ ] GitHub repo secret `NPM_TOKEN` set in **Settings → Secrets and variables → Actions**

---

## Step 1 — Add the NPM_TOKEN secret to GitHub

1. Go to <https://github.com/andersonlimahw/lemon-code-graph/settings/secrets/actions>
2. Click **New repository secret**
3. Name: `NPM_TOKEN`
4. Value: your npm publish token (create one at <https://www.npmjs.com/settings/~/tokens>)
5. Click **Add secret**

---

## Step 2 — Verify the npm org scope exists

Run locally:

```bash
npm org ls @andersonlimahw
```

If the org doesn't exist yet, create it at <https://www.npmjs.com/org/create>.

---

## Step 3 — Verify the release scripts exist and are correct

The following scripts are called by the Release workflow:

| Script | Purpose |
|---|---|
| `scripts/build-bundle.sh` | Builds a self-contained Node + app archive per platform |
| `scripts/pack-npm.sh` | Creates the npm thin-installer + per-platform packages |
| `scripts/extract-release-notes.mjs` | Pulls release notes from CHANGELOG.md |

Check they exist and are executable:

```bash
ls -la scripts/build-bundle.sh scripts/pack-npm.sh scripts/extract-release-notes.mjs
chmod +x scripts/build-bundle.sh scripts/pack-npm.sh
```

---

## Step 4 — Ensure CHANGELOG.md has the release section

The release workflow reads notes from CHANGELOG.md. Confirm the file has a
`## [0.9.4]` section (or `## [Unreleased]` as fallback). Example:

```markdown
## [0.9.4] - 2026-06-05

### Added
- Kotlin/Ktor framework resolver
- Java extractor improvements (abstract methods, annotations, async)
- Full-stack/frontend/mobile framework support
```

---

## Step 5 — Trigger the Release workflow

1. Go to <https://github.com/andersonlimahw/lemon-code-graph/actions/workflows/release.yml>
2. Click **Run workflow** → select branch `main` → **Run workflow**

The workflow will:
1. Build self-contained bundles for all 6 targets:
   `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64`, `win32-arm64`
2. Generate `SHA256SUMS`
3. Create GitHub Release `v0.9.4` with all archives as assets
4. Publish to npm:
   - `@andersonlimahw/lemon-codegraph-darwin-arm64`
   - `@andersonlimahw/lemon-codegraph-darwin-x64`
   - `@andersonlimahw/lemon-codegraph-linux-x64`
   - `@andersonlimahw/lemon-codegraph-linux-arm64`
   - `@andersonlimahw/lemon-codegraph-win32-x64`
   - `@andersonlimahw/lemon-codegraph-win32-arm64`
   - `@andersonlimahw/lemon-codegraph` (main shim)

---

## Step 6 — Verify after workflow completes

```bash
# Confirm GitHub Release exists
gh release view v0.9.4 --repo andersonlimahw/lemon-code-graph

# Confirm npm package is live
npm view @andersonlimahw/lemon-codegraph version

# Test the standalone installer
curl -fsSL https://raw.githubusercontent.com/andersonlimahw/lemon-code-graph/main/install.sh | sh

# Test npm install
npm install -g @andersonlimahw/lemon-codegraph
codegraph --help
```

---

## Troubleshooting

### "No release notes found"
Add a `## [0.9.4]` or `## [Unreleased]` section to CHANGELOG.md.

### "Package already exists" on npm
The workflow handles this with `npm view "$name@$V" version` checks — it skips packages already on the registry. Safe to re-run.

### Per-platform package missing after install
The npm shim self-heals: it downloads the matching bundle from GitHub Releases automatically. The user sees:
```
codegraph: platform bundle missing (registry did not provide @andersonlimahw/lemon-codegraph-<platform>).
codegraph: downloading codegraph-<platform>.tar.gz from GitHub Releases...
```

### Can't access `@andersonlimahw` scope on npm
Create the org at <https://www.npmjs.com/org/create>, or publish as unscoped:
change `"name": "@andersonlimahw/lemon-codegraph"` to `"name": "lemon-codegraph"` in
`package.json` and update all references in `scripts/pack-npm.sh` and `scripts/npm-shim.js`.
