# Documentation Style Guide

This guide keeps docs simple, scalable, and dynamic with zero redundancy.

--

## Structure

- Group content under `docs/`:
  - `guides/` - how-tos and developer onboarding
  - `ops/` - runbooks, evidence, checklists, plans
  - `database/` - schema hardening notes and rollout plans
  - `product/` - mission, roadmap, architecture

--

## File Naming

- Use lowercase with hyphens: `service-runbook.md`.
- Dated artefacts: `YYYY-MM-DD-*` for evidence/release notes; future-dated plans allowed.
- Migrations: `YYYYMMDDHHMM_description.sql` (12-digit timestamp).

--

## Content Principles

- Single source of truth: link to existing docs instead of copying.
- Keep sections short; prefer bulleted lists over paragraphs.
- Put commands and file paths in code formatting.
- Avoid secrets and real IDs; use env variables and placeholders.
- Cross-reference tests and migrations by file path when relevant.

--

## Templates

### Runbook Skeleton

```
# <Service> Runbook

## Purpose
- One sentence outcome.

## Key Tables & Functions
- Bulleted list with exact identifiers.

## SOP
1. Step with an example query
2. Step with an expected state

## Troubleshooting
| Symptom | Diagnostic | Mitigation |

## Evidence
- Where to store logs and SQL snapshots
```

### Plan Skeleton

```
# <Topic> Plan (<YYYY-MM-DD>)

## Goal
- Crisp, measurable outcome

## Changes
- Bulleted changes (migrations, scripts, docs)

## Rollout
- Steps, checkpoints, rollback

## Acceptance
- Objective checks and links to evidence
```

--

## Writing Tips

- Use present tense and active voice.
- Prefer exact nouns: table/function names over descriptions.
- Keep examples minimal; link to full samples under `product/examples/`.
- Validate instructions by pasting commands into a fresh shell with `ENV_FILE` exported.

