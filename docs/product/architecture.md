# Architecture Overview (Template)

## High-level Diagram

```mermaid
flowchart LR
  A["Clients"] --> B["API"]
  B --> C["Domain Layer"]
  C --> D["Data Store"]
  C --> E["Background Jobs"]
  C --> F["External Integrations"]
```

## Key Decisions
- <Decision 1 + rationale>
- <Decision 2 + rationale>

## Data / State
- <What is the source of truth?>
- <How do we model state transitions?>

## Failure Modes
- <Expected failures and recovery strategy>

