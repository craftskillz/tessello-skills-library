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

`dist/` can be zipped and dropped onto Tessello, or copied into your Modules folder. The Module talks to the Host through [`@tessello/sdk`](https://www.npmjs.com/package/@tessello/sdk) and follows the [Convention](https://github.com/craftskillz/tessello/blob/main/convention/CONVENTION.md).

## Release

Raise `version` in `manifest.json` and `package.json` (`npm version <major|minor|patch> --no-git-tag-version`, then the Manifest by hand), commit, then push the tag `v<version>`. The Release workflow tests and builds the package, then publishes it on GitHub Pages as `<version>.zip`. A published version is never overwritten: a listing in the Marketplace is pinned to the fingerprint of its bytes.

## License

MIT
