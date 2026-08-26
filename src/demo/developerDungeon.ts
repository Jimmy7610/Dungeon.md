/**
 * The built-in demo adventure.
 *
 * Every construct used here is supported by the parser - if you add syntax to
 * this file, add it to the parser and to the in-app syntax guide too. Source
 * lines are kept under ~64 characters so the editor never needs to scroll
 * sideways at the default split.
 */
export const DEVELOPER_DUNGEON = `# The Developer Dungeon

The repository should have been archived years ago.

## The Repository

A forgotten project waits in the dark.
The CI badge is still red.

- Sword
- Coffee Potion

> The last commit was 1,827 days ago.
> The author's email no longer exists.

- [ ] Find the Git Key
- [ ] Defeat Legacy Code

[Descend into Bug Basement](#bug-basement)

## Bug Basement

Something is moving between the TODO comments.

\`\`\`enemy
type: bug
count: 4
health: 25
damage: 1
\`\`\`

- Git Key
- Health Potion

- [ ] Squash the bugs

> Fixed in the next release. Signed, 2019.

[Enter Dependency Hell](#dependency-hell)

## Dependency Hell

Every package depends on another package.
One of them depends on itself.

\`\`\`enemy
type: dependency
count: 4
health: 35
damage: 1
\`\`\`

- Rubber Duck
- Gold

> Updating one package broke twelve others.
> We do not speak of the lockfile.

[Continue to Merge Chamber](#merge-chamber)

## Merge Chamber

Two branches entered. Neither is willing to leave.

\`\`\`enemy
type: null-pointer
count: 3
health: 40
damage: 1
\`\`\`

- Stack Overflow Scroll
- Coffee Potion

\`\`\`door
label: Unlock the Legacy Vault
target: legacy-vault
requires: Git Key
\`\`\`

## Legacy Vault

There is no documentation. There never was.

- Debugger

\`\`\`boss
type: legacy-code
name: LEGACY CODE
health: 250
damage: 2
\`\`\`
`;
