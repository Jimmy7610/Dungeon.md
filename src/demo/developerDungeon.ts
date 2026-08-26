/**
 * The built-in campaign: 14 main rooms plus 3 optional secret rooms.
 *
 * Everything the campaign is - rooms, themes, loot, enemies, elites, doors and
 * secrets - lives in this Markdown. The runtime stays generic; there is no
 * campaign-specific code anywhere in the game.
 *
 * Every construct used here is supported by the parser. If you add syntax to
 * this file, add it to the parser and to the in-app syntax guide too. Source
 * lines are kept under ~64 characters so the editor never needs to scroll
 * sideways at the default split.
 */
export const DEVELOPER_DUNGEON = `# The Developer Dungeon

The repository should have been archived years ago.

## The Repository

\`\`\`room
theme: repository
\`\`\`

The lights are still on. Nothing else is.
The last clean build predates three package managers.

- Debugger
- Coffee Potion

> Commit 1 of 4,812: "initial commit".
> Commit 4,812 of 4,812: "temporary fix".

- [ ] Find the Debugger
- [ ] Defeat Legacy Code

[Descend into Bug Basement](#bug-basement)

## Bug Basement

\`\`\`room
theme: basement
\`\`\`

Something is moving between the TODO comments.

\`\`\`enemy
type: bug
count: 4
health: 25
damage: 1
\`\`\`

- Git Key
- Health Potion
- Gold

- [ ] Squash the bugs
- [ ] Find the Git Key

> Reported in 2019. Reproduced in 2020. Ignored since.

[Follow the cables to Cache Corridor](#cache-corridor)

## Cache Corridor

\`\`\`room
theme: cache
\`\`\`

Everything here is a copy of something older.
None of it has been invalidated.

\`\`\`enemy
type: slime
count: 3
health: 30
damage: 1
\`\`\`

- Cache Jacket
- Patch Kit
- Health Potion
- Gold

> Cleared the cache. It came back.

[Continue into Null Hall](#null-hall)

## Null Hall

\`\`\`room
theme: null
\`\`\`

The corridor is defined. Its contents are not.

\`\`\`enemy
type: null-pointer
count: 3
health: 40
damage: 1
\`\`\`

\`\`\`enemy
type: null-pointer
count: 1
health: 85
damage: 2
elite: true
\`\`\`

- Refactor Blade
- Coffee Potion

> Expected an object. Received an apology.

\`\`\`door
label: Inspect the corrupted wall
target: 404-room
hidden: true
\`\`\`

[Descend into Dependency Hell](#dependency-hell)

## 404 Room

\`\`\`room
theme: secret
\`\`\`

Room not found.
Yet here you are.

- Stack Overflow Scroll
- Energy Drink
- Gold
- Gold

> This page intentionally left reachable.

\`\`\`door
label: Return to Null Hall
target: null-hall
\`\`\`

## Dependency Hell

\`\`\`room
theme: dependency
\`\`\`

Every package depends on another package.
One of them depends on itself.

\`\`\`enemy
type: dependency
count: 5
health: 45
damage: 1
\`\`\`

- Heart Upgrade
- Patch Kit
- Gold

> Resolved 1,204 packages. Trusted none of them.

[Push on to the Package Graveyard](#package-graveyard)

## Package Graveyard

\`\`\`room
theme: graveyard
\`\`\`

Deprecated, unpublished, and still installed somewhere.

\`\`\`enemy
type: dependency
count: 4
health: 45
damage: 1
\`\`\`

\`\`\`enemy
type: dependency
count: 1
health: 110
damage: 2
elite: true
\`\`\`

- Stack Trace Spear
- Health Potion
- Gold

> Maintainer last seen: four job titles ago.

\`\`\`door
label: Pry open the loose floor panel
target: stash-overflow
hidden: true
\`\`\`

[Enter the Merge Chamber](#merge-chamber)

## Stash Overflow

\`\`\`room
theme: secret
\`\`\`

Someone hid the good tools down here
and then forgot the branch name.

- Hotfix
- Commit Shield
- Gold
- Gold

> git stash finally contained something useful.

\`\`\`door
label: Climb back to the Package Graveyard
target: package-graveyard
\`\`\`

## Merge Chamber

\`\`\`room
theme: merge
\`\`\`

Two branches entered. Neither is willing to leave.

\`\`\`enemy
type: bug
count: 3
health: 35
damage: 1
\`\`\`

\`\`\`enemy
type: null-pointer
count: 3
health: 45
damage: 1
\`\`\`

- Rubber Duck
- Patch Kit
- Coffee Potion

> Accept both changes. Regret both changes.

[Step into the CI Gauntlet](#ci-gauntlet)

## CI Gauntlet

\`\`\`room
theme: ci
\`\`\`

Every job runs. Every job fails. Every job retries.

\`\`\`enemy
type: bug
count: 3
health: 40
damage: 1
\`\`\`

\`\`\`enemy
type: slime
count: 2
health: 45
damage: 1
\`\`\`

\`\`\`enemy
type: bug
count: 1
health: 95
damage: 2
elite: true
\`\`\`

- Dependency Hammer
- Health Potion
- Gold

> Flaky. Re-run it. Still flaky. Merge it.

[Approach the Firewall Gate](#firewall-gate)

## Firewall Gate

\`\`\`room
theme: firewall
\`\`\`

The last security layer is still running.
Nobody remembers what it protects.

\`\`\`enemy
type: dependency
count: 4
health: 60
damage: 1
\`\`\`

\`\`\`enemy
type: null-pointer
count: 1
health: 120
damage: 2
elite: true
\`\`\`

- Firewall Vest
- Heart Upgrade
- Patch Kit

> Rule 1: deny all. Rule 2: except this. Rule 3: and this.

[Slip through to the Memory Leak](#memory-leak)

## Memory Leak

\`\`\`room
theme: memory
\`\`\`

The room is using 14 GB and climbing.

\`\`\`enemy
type: slime
count: 3
health: 50
damage: 1
\`\`\`

\`\`\`enemy
type: null-pointer
count: 3
health: 55
damage: 1
\`\`\`

\`\`\`enemy
type: bug
count: 2
health: 45
damage: 1
\`\`\`

- Energy Drink
- Coffee Potion
- Gold

> It frees everything on shutdown. Eventually.

[Push into the Deprecated Wing](#deprecated-wing)

## Deprecated Wing

\`\`\`room
theme: deprecated
\`\`\`

Scheduled for removal in the next major version.
That was six major versions ago.

\`\`\`enemy
type: skeleton
count: 4
health: 60
damage: 1
\`\`\`

\`\`\`enemy
type: dependency
count: 1
health: 130
damage: 2
elite: true
\`\`\`

- Kernel Plate
- Stack Overflow Scroll
- Full Restore

> Use the new API instead. There is no new API.

[Enter the Refactor Lab](#refactor-lab)

## Refactor Lab

\`\`\`room
theme: refactor
\`\`\`

Someone got here first and cleaned up.
It is the only room that still compiles.

\`\`\`enemy
type: null-pointer
count: 3
health: 70
damage: 1
\`\`\`

\`\`\`enemy
type: dependency
count: 2
health: 70
damage: 1
\`\`\`

\`\`\`enemy
type: slime
count: 1
health: 120
damage: 2
elite: true
\`\`\`

- Merge Axe
- Heart Upgrade
- Health Potion
- Gold

> Renamed everything. Changed nothing. Perfect.

[Unseal the Legacy Archive](#legacy-archive)

## Legacy Archive

\`\`\`room
theme: archive
\`\`\`

Every version that was ever shipped is filed here.
Several of them are still running in production.

\`\`\`enemy
type: skeleton
count: 3
health: 70
damage: 1
\`\`\`

\`\`\`enemy
type: null-pointer
count: 2
health: 75
damage: 1
\`\`\`

\`\`\`enemy
type: bug
count: 1
health: 140
damage: 2
elite: true
\`\`\`

\`\`\`enemy
type: dependency
count: 1
health: 140
damage: 2
elite: true
\`\`\`

- Full Restore
- Patch Kit
- Gold

> Do not delete. Reason: unknown.

\`\`\`door
label: Lift the loose archive grate
target: root-cellar
hidden: true
\`\`\`

\`\`\`door
label: Unlock the Legacy Vault
target: legacy-vault
requires: Git Key
\`\`\`

## Root Cellar

\`\`\`room
theme: secret
\`\`\`

Below the archive, below the logs,
below anything anyone documented.

- Root Access
- Root Armor
- sudo
- Gold

> You do not have permission to be here.
> That has never stopped anyone.

\`\`\`door
label: Climb back to the Legacy Archive
target: legacy-archive
\`\`\`

## Legacy Vault

\`\`\`room
theme: vault
\`\`\`

There is no documentation. There never was.

\`\`\`boss
type: legacy-code
name: LEGACY CODE
health: 450
damage: 2
\`\`\`
`;
