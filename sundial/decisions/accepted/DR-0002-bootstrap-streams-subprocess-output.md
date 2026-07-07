---
id: DR-0002
title: Bootstrap streams subprocess output
status: accepted
domain: cli.bootstrap
created: 2026-05-04
references:
  - packages/cli/src/main.ts#runBootstrapCommand
  - packages/cli/src/main.ts
updated: 2026-05-04
author: bjackson
---
## Decision

Long-running bootstrap runs must stream provider stdout and stderr as the subprocess runs instead of buffering until completion.

## Appendix

Bootstrap can run for many minutes while the provider drafts candidates. Buffering until exit makes a healthy run indistinguishable from a hung one in both terminals and the extension's output channel, and it hides the per-step traces that humans rely on to decide whether to interrupt.
