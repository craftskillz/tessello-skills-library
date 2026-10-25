# Skills Library

Keep the agent skills you have judged, place them on a radar, and publish it as a blog post.

Skills Library is a Module of [Tessello](https://github.com/craftskillz/tessello), a composable web app where you build your space from Modules: each one a View, and a Widget on the Home. Its Identifier is `@craftskillz/skills-library`. Everything it keeps stays in your Tessello space, on your computer.

![Skills Library icon](icon.svg)

What it does, screen by screen, is in its User guide: [guide/guide.md](guide/guide.md), also shown inside Tessello (ⓘ, then **User guide**).

## Install

- From the Marketplace of Tessello, once Skills Library is listed there: https://tessello-marketplace.pages.dev/
- Or drop a package onto Tessello: every version is published at `https://craftskillz.github.io/tessello-skills-library/<version>.zip`.

## Develop

Node 24 or later.

```sh
npm ci
npm test            # unit tests
npm run typecheck
npm run build       # writes the package to dist/
npx tessello validate dist
```

With [just](https://github.com/casey/just): `just test`, `just typecheck`, `just build` (builds and validates).

`dist/` can be zipped and dropped onto Tessello, or copied into your Modules folder. The Module talks to the Host through [`@tessello/sdk`](https://www.npmjs.com/package/@tessello/sdk) and follows the [Convention](https://github.com/craftskillz/tessello/blob/main/convention/CONVENTION.md).

## Release

From an up-to-date `main` with nothing to commit, run `just publish minor` (or `major`, `patch`, `fix`). It checks types and tests, builds and validates the package, raises the version in `package.json`, `package-lock.json` and `manifest.json`, commits, tags `v<version>` and pushes. The Release workflow then publishes the package on GitHub Pages as `<version>.zip`. A published version is never overwritten: a listing in the Marketplace is pinned to the fingerprint of its bytes.

To list that version on the [Marketplace](https://tessello-marketplace.pages.dev/), once the Release workflow is green: `just marketplace skills-library` in the `tessello` repository. The steps are in [RELEASING.md](https://github.com/craftskillz/tessello/blob/main/RELEASING.md).

## License

MIT
