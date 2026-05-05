# Discord Server Setup Guide

This guide recommends a practical Discord structure for Lumina so the server supports users, contributors, and maintainers as the project grows.

## Goals

- make onboarding easy
- keep support discoverable
- separate fast chat from durable knowledge
- protect maintainers from moderation drift
- give contributors clear working spaces

## Recommended Server Categories

### 1. Start Here

- `#welcome`
- `#rules`
- `#announcements`
- `#start-here`
- `#release-notes`

Purpose:

- onboarding
- expectations
- official project news

### 2. Help and Usage

- `#help`
- `#install-and-tooling`
- `#runtime-ui`
- `#wasm-and-performance`
- `#editor-and-lsp`

Purpose:

- user support
- practical debugging
- domain-focused questions

### 3. Build and Design

- `#language-design`
- `#compiler-and-codegen`
- `#stdlib-and-runtime`
- `#ecosystem-and-packages`

Purpose:

- design discussion
- implementation planning
- roadmap shaping

### 4. Community

- `#introductions`
- `#showcase`
- `#community-links`
- `#off-topic`

Purpose:

- belonging
- demos
- light social energy without polluting technical channels

### 5. Contributor Coordination

- `#contributors`
- `#good-first-issues`
- `#docs-and-education`
- `#ops-and-moderation`

Purpose:

- active work coordination
- contributor onboarding
- moderation/admin workflow

## Recommended Roles

- `Admin`
- `Moderator`
- `Maintainer`
- `Contributor`
- `Helper`
- `Member`
- `New Member`

Optional interest roles:

- `UI`
- `WASM`
- `Compiler`
- `LSP`
- `Docs`

## Permission Model

- `#announcements`: post only by maintainers/admins
- `#rules`: read-only
- `#welcome`: read-only or limited posting
- help/design channels: open to members
- ops/moderation channels: restricted to staff

Use onboarding so new members must:

- accept rules
- choose interest roles if desired
- wait until basic verification is complete before posting links or attachments

## Recommended Features to Enable

- Community mode
- AutoMod for spam/slurs/link abuse
- Rule screening
- Forum channels where long support threads matter
- Slow mode in high-traffic channels
- onboarding prompts for role selection

## Suggested Channel Types

- Use standard text channels for fast support and announcements
- Use forum channels for:
  - bug reports
  - feature requests
  - project showcase
  - longer design threads

This helps keep repeated support questions searchable.

## Suggested Bot/Automation Policy

Keep bots minimal. Prefer:

- moderation/AutoMod
- optional issue or release feed
- optional docs or CI notifications

Avoid noisy bots that flood channels with low-value events.

## Support Workflow

1. User lands in `#welcome` and reads `#rules`.
2. User checks `#start-here` for docs and install paths.
3. User asks in the right help channel using a reproducible format.
4. Helpers redirect solved patterns into docs or FAQ references.
5. Repeated high-value issues become docs, examples, or forum references.

## Contributor Workflow

1. Contributor introduces themselves in `#contributors`.
2. Maintainers point them to issues, docs gaps, or benchmarks.
3. Design discussions happen in public channels unless sensitive.
4. Decisions that matter should be copied back into repo docs/issues, not left only in chat.

## Moderator Workflow

- keep rule enforcement consistent
- move threads instead of scolding when possible
- act quickly on spam, harassment, unsafe links, and leaked secrets
- document repeated issues so moderation does not become personality-driven

## Best Practices for Lumina Specifically

- keep `#runtime-ui`, `#compiler-and-codegen`, and `#wasm-and-performance` separate
- keep benchmark claims tied to reproducible commands or screenshots
- route roadmap debates into GitHub issues/docs when they affect long-term direction
- encourage examples and minimal repros over abstract argument

## Launch Checklist

- rules written and posted
- channel structure created
- roles configured
- onboarding enabled
- announcement and welcome copy written
- docs/community links added
- first moderators assigned
- issue/report workflow defined

## Suggested First Pinned Messages

- docs index
- install/start commands
- how to ask for help
- GitHub issue tracker
- benchmark/report format
- code of conduct summary
