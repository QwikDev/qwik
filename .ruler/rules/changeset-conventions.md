# Changeset Conventions Rule

When a change affects published packages, write changesets with `pnpm change` (or by adding files
under `.changeset/`) using the bump level that matches the kind of change.

## Bump Level

- `patch`: bug fixes.
- `minor`: new features.
- `major`: API removal. A `major` may also include a new feature, but it must remove or break a
  public API.

## One Changeset Per Change

Create a separate changeset for each `patch`, `minor`, or `major` change. Do not combine unrelated
fixes and features into one changeset. If a single PR carries a bug fix and a new feature, write one
`patch` changeset and one `minor` changeset.

## Casing

Write the changeset summary in lowercase, including any leading type prefix such as `fix:` or
`feat:`. Do not uppercase the prefix or shout the summary.

## Length

Each changeset summary should aim for around 150 characters and must not exceed 300 characters.
Describe the user-facing change in one tight sentence; move deeper detail to the PR description.
