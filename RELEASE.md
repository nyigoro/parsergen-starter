# Release Process

1. Update `CHANGELOG.md`.
2. Bump version in `package.json`.
3. Run `npm test` and `npm run build`.
4. Run `npm run pack:check`.
5. Tag the release: `git tag vX.Y.Z` and `git push origin vX.Y.Z`.
6. Publish: `npm publish`.
