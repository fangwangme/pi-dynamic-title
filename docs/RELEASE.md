# Pi Dynamic Title Extension Release Guide

This document outlines the standard structure of a Pi Coding Agent Extension and details the step-by-step workflows for releasing it via **Git** and **NPM**.

---

## 1. Standard Extension Structure

A standard Pi extension follows this directory layout:

```
pi-dynamic-title/
├── .gitignore               # Ignores local build outputs, node_modules, and env files
├── package.json             # Manifest declaring metadata, dependencies, entry points
├── tsconfig.json            # TypeScript configuration
├── README.md                # Usage and deployment documentation
├── CHANGELOG.md             # Version history
├── src/                     # TypeScript Source Directory (Development)
│   ├── index.ts             # Entry point
│   ├── config.ts            # Config manager
│   └── title-formatter.ts   # Formatting engine
└── dist/                    # Compiled JavaScript Output (Production Release)
    ├── index.js
    ├── config.js
    └── title-formatter.js
```

### Manifest Configuration (`package.json`)

To support both local source development and compiled distribution, the `package.json` contains:
- **`main`**: The package entry point. Points to the compiled output `"dist/index.js"` for production, or `"src/index.ts"` during development.
- **`types`**: The typing definitions `"dist/index.d.ts"`.
- **`pi.extensions`**: Tells Pi where the extension entry files are. Points to `["./dist/index.js"]` for production or `["./src/index.ts"]` for development.
- **`files`**: A whitelist of directories and files included in the NPM registry distribution.

---

## 2. Releasing via Git

Because compiled JS files (`dist/`) are typically not committed to the source code repository (`.gitignore` excludes `dist/`), there are two ways to manage releases using Git:

### Method A: Clone & Build (Recommended for Developers)
Users clone the repository and build the assets locally.

1. **Tag the Release**:
   Create a semantic version tag in Git:
   ```bash
   git tag -a v0.0.1 -m "Release v0.0.1"
   git push origin v0.0.1
   ```
2. **User Installation**:
   The user clones the repository and runs the build command:
   ```bash
   git clone https://github.com/username/pi-dynamic-title.git
   cd pi-dynamic-title
   bun install
   bun run build
   ```
   The extension will compile into `dist/` and is ready to load.

### Method B: GitHub Release Tarball (Pre-compiled Release)
You compile the assets locally and upload them to a GitHub Release.

1. **Build the extension**:
   ```bash
   bun run build
   ```
2. **Archive the production files**:
   Generate a tarball containing the compiled output and metadata (excluding `node_modules` and `src`):
   ```bash
   tar -czf pi-dynamic-title-v0.0.1.tar.gz dist/ package.json README.md CHANGELOG.md
   ```
3. **Upload Release Asset**:
   Go to GitHub -> Releases -> Draft a new release -> Upload the `pi-dynamic-title-v0.0.1.tar.gz` file. Users can download this archive and extract it directly into their Pi extensions folder.

---

## 3. Releasing via NPM (Recommended for Distribution)

NPM allows you to publish the extension so users can install it globally or as a dependency. By default, `npm publish` ignores files listed in `.gitignore`. However, you want the `dist/` folder to be uploaded to NPM even if it's ignored in Git.

You handle this using the `"files"` field in `package.json`, which overrides `.gitignore` for npm packaging.

### Step-by-Step Publish Workflow:

1. **Verify `package.json` Configuration**:
   Ensure the following properties are configured in `package.json` before publishing:
   ```json
   {
     "name": "pi-dynamic-title",
     "version": "0.0.1",
     "main": "dist/index.js",
     "types": "dist/index.d.ts",
     "files": [
       "dist",
       "README.md",
       "CHANGELOG.md",
       "package.json"
     ],
     "pi": {
       "extensions": [
         "./dist/index.js"
       ]
     }
   }
   ```
2. **Build the production assets**:
   Ensure the output JS files are compiled and up-to-date:
   ```bash
   bun run build
   ```
3. **Login to NPM Registry**:
   Ensure you are authenticated (use npm command or bun credentials):
   ```bash
   npm login
   ```
4. **Publish the Package**:
   Publish the whitelisted files to the registry:
   ```bash
   npm publish
   ```
   *(If publishing a scoped package or draft public package for the first time, use `npm publish --access public`)*.

Once published, users can install the extension directly.
