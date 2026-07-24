# Crest88 Website

Source for [crest88.com](https://crest88.com), the public website for Crest88's AI-agent product.

## Architecture

- Static HTML, CSS, and JavaScript
- GitHub Pages from `main`
- Custom domain preserved by `CNAME`
- No analytics or marketing cookies

The `epic/operator-public-site` branch is the non-production integration target. A pull request
must not be merged to `main` until the complete site has been reviewed as a local production build.

## Local preview

Install the locked, dependency-free toolchain once:

```bash
npm ci
```

Serve the site at `http://localhost:4173`:

```bash
npm run serve
```

Choose a different port when needed:

```bash
npm run serve -- --port 3101
```

## Verification

Run the same deterministic gate used in CI:

```bash
npm run check
```

The gate checks:

- required document metadata and basic HTML structure
- internal file links and fragment targets
- image, form-control, and button accessibility smoke rules
- duplicate IDs and safe external-tab links
- CSS delimiter balance and JavaScript parse validity
- regression tests for broken links and missing metadata

Pull requests into `epic/operator-public-site` and `main` run
`.github/workflows/site-checks.yml`. Repository administrators must configure the `Static site`
job as a required status check for protected branches; workflow code cannot enforce branch
protection by itself.

## Publishing

Only `main` publishes to [crest88.com](https://crest88.com). The site remains unchanged in
production until an explicitly reviewed integration-to-`main` pull request is merged.
