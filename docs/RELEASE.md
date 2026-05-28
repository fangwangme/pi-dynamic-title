# Pi Dynamic Title Release Guide

This extension is built to run directly from its TypeScript source files. Users install it with `pi install`; no compilation or pre-building is required.

## Install Target (GitHub Release)

To install a specific version tag:

```bash
pi install git:github.com/fangwangme/pi-dynamic-title@v0.0.1
```

Replace `v0.0.1` with the release tag you want to install.

For local development installation:

```bash
bun install
pi install ./
```

## Package Setup

`package.json` specifies the entry points directly from TypeScript source code:

```json
{
  "main": "index.ts",
  "types": "index.ts",
  "pi": {
    "extensions": ["./index.ts"]
  },
  "files": [
    "index.ts",
    "config.ts",
    "title-formatter.ts",
    "package.json",
    "README.md",
    "CHANGELOG.md"
  ]
}
```

Pi's extension loader uses `jiti` under the hood to compile and run TypeScript files dynamically.

## Release Process

Since we do not publish to NPM and there are no compilation steps, creating a new release is very simple:

1. Update `package.json` with the new version (e.g., `"version": "0.0.2"`).
2. Commit your changes.
3. Tag the release and push to GitHub:
   ```bash
   git tag -a v0.0.2 -m "Release v0.0.2"
   git push origin HEAD --follow-tags
   ```
4. Create a release on GitHub:
   ```bash
   gh release create v0.0.2 --generate-notes
   ```

Users can now install the tag directly using the `pi install` command.
