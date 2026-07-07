# Sundial

*The agent is skilled. The engineer is the principal. The DR is the record of their collaboration.*

### A Portable Decision Record Workflow for Staff-Engineer-Supervised AI Coding

## Problem

Existing AI coding agents optimize for autonomy. They make architectural choices, select implementation patterns, and commit to design decisions without surfacing them to the engineer. The most important variable that predicts success of an LLM agent is "Is the the
right data in the context window?"  Ideally the context window is full of relevant context with the less relevant stuff left out Current tools often put creative and oversight power in the model's hands, even though models remain inconsistent software engineers.
Experienced engineers shape tradeoffs, name constraints, choose patterns, and preserve collective ownership.

At the same time, models are become better at writing code that works and does what was specified. This puts an incentive to give more autonomy to the models and realize more efficiency when writing software. On the first order, there is significant tension bewteen 
efficiency and quality.  The more an experienced engineer is in the loop, the higher the quality of the result becomes, but the slower it is the write the code.  Can we ease some of this tension and make it less zero-sum?
---

## Core Idea

Sundial turns staff engineer judgment into durable agent context. Sundial captures that context as **Decision Records (DRs)**: explicit, reviewable records of decisions, rejected alternatives, constraints, and reference implementations.

Agents use these records through decision-aware design and implementation workflows. Before choosing patterns, structure, dependencies, or testing strategy, the agent consults accepted DRs. When it encounters a decision not covered by existing precedent, it creates a candidate DR. The engineer reviews candidates in Sundial, accepting the ones that should become future guidance.

This creates a practical continuous-learning loop without changing the model itself. Every correction, preference, review comment, or rejected approach is an opportunity to improve project memory. Over time, the DR store should make the agent more aligned with the engineer's judgment, reducing repeated corrections and lowering the amount of human intervention needed for routine decisions.

Sundial is implemented around a portable core:

- `sundial` CLI for DR retrieval, candidate creation, status validation, tags, and bootstrap.
- `decision-aware-design` and `decision-aware-implement` skills.
- Candidate Inbox where the engineer edits, accepts, rejects, merges, or retires candidates.
- A library of candidate DRs that can bootstrap a project with good practices.

This is not model-specific. Any agent that can follow skills and use CLI tools can participate.

---

## Continuous Learning Through Memory

Sundial is a continuous learning system in the practical product sense, not in the model-training sense. It does not fine-tune the model, update weights, or permanently change the underlying LLM. It gives the agent a durable project memory of the engineer's decisions.

The desired state is not "the agent writes code without interruption." The desired state is "the agent applies the engineer's accepted decisions correctly, and asks for new guidance only when precedent is missing or ambiguous."

In this framing:

- **Accepted DRs** are durable memory: they encode how the engineer wants future similar situations handled.
- **Candidate records** are proposed memory: the agent noticed a possible decision, but the engineer has not accepted it as precedent.
- **User corrections** are learning opportunities: the model's first attempt revealed missing or unapplied guidance.
- **Candidate review** protects the memory: proposed records are not precedent until the engineer accepts them.
- **Skill reviews and status validation** help maintain memory quality: they look for drift between implementation, design, accepted DRs, and actual code.

Every user interaction is therefore an opportunity to record a decision. A correction, preference, rejection, clarification, or "do it this way instead" should be checked against existing DRs. If a DR already covers it, the agent should learn to apply that precedent. If no DR covers it, the agent should create a candidate so the engineer can decide whether the correction should become durable guidance.

The goal is not permanent high-touch supervision. The goal is a memory system that improves with use. Early sessions may require frequent intervention because little precedent exists. Over time, accepted DRs should reduce ambiguity, improve agent behavior, and lower the intervention rate. Human control remains; routine human interruption should decline.

---

## Decision Records

A DR is broader than an ADR (Architectural Decision Record). Sundial records architectural decisions, implementation patterns, dependency choices, organizational patterns, testing approaches, error-handling strategy, and other choices an agent should not silently reinvent.

DRs are markdown files with frontmatter. Accepted DRs become precedent. Candidate DRs are proposed by agents and reviewed by the engineer before they become precedent. The principal has full ownership of the DR ledger, and can edit, remove, and add DRs at any time.

To support retrieval and context selection, each DR carries three levels of detail:

- **Short summary**: one or two lines suitable for retrieval listings and compact context injection.
- **Medium guidance**: the practical rule the agent should apply, plus applies-when and does-not-apply-when notes.
- **Full record**: rationale, rejected alternatives, consequences, and reference implementations.

DRs also carry tags. Tags are not purely free-form: the allowed tag universe lives in `sundial/tags.md`, a separate markdown document the engineer can review and edit. V1 retrieval is tag-addressed: the agent selects known tags, the CLI returns accepted DRs matching those tags, and detail expands from short to medium to full only as needed.

Reference implementations make DRs living patterns:

```markdown
## Reference Implementation
<!-- sundial:ref src/infrastructure/repositories/OrderRepository.ts#OrderRepository -->
<!-- sundial:ref src/domain/repositories/IOrderRepository.ts -->
```

References are pointers, not embedded code. They use file paths and symbol anchors instead of line numbers so agents can calibrate against the live codebase.

---

## Candidate Inbox

The central review object is the **candidate**: a decision or DR proposed by the agent but not yet accepted by the engineer.

Candidates appear in Sundial's Candidate Inbox. The engineer can:

- Edit title, decision, rationale, alternatives, tags, affected files, and reference pointers.
- Merge duplicate candidates.
- Accept a candidate as an accepted DR.
- Reject a candidate with feedback.
- Retire a candidate, optionally with an existing DR or candidate as the successor.
- Inspect related code changes and session events.

This keeps stewardship outside the LLM's conversational flow. The model proposes; the engineer curates.

On disk, candidates live under `sundial/decisions/candidates/`, not in a separate top-level `sundial/candidates/` directory. Acceptance moves a candidate into `sundial/decisions/accepted/`; rejection or supersession moves it into the corresponding DR lifecycle folder.

We will ship an optional VS Code extension to make managing the the Candidate Inbox easier. Candidates are plain markdown files, so the engineer can also review, edit, accept, reject, or reorganize them directly in a text editor. The extension is a convenient stewardship UI over files, not the only way to manage them.

### Candidate Review

A new DR candidate is proposed memory. The candidate is not precedent until the engineer accepts it. Rejection or supersession preserves the review trail without creating new precedent.

---

## Agent Workflow

### `decision-aware-design`

The design skill runs before implementation when a task has non-trivial design surface:

1. Operates against a markdown file, which captures the design (this could be some structured system as well, or just a file in a temp directory)
2. Create an initial proposal using accepted DR context from `sundial dr retrieve`.
3. Run a design review checklist inside the skill.
4. Flesh out the proposal with alternatives, tradeoffs, affected files, test strategy, and relevant DRs.
5. Incorporate review feedback or explicitly reject it with rationale.
6. Propose new DRs if the design introduces reusable decisions or patterns.
7. Leave proposed candidates in Sundial for engineer review.
8. Complete the design with an implementation-ready summary.

### `decision-aware-implement`

The implementation skill keeps code aligned with the completed design and accepted DRs:

1. Load the design basis, accepted DRs, and candidate records.
2. Implement in reviewable slices.
3. Run code review checks inside the skill before completion.
4. Incorporate valid review feedback before completion.
5. Create candidates when implementation reveals new reusable decisions.
6. Run `sundial status` when the DR store changes.

Skill-level review is the V2 choice over per-edit hook enforcement. Hooks or delegated review adapters can be added later if a concrete enforcement gap appears, but the initial bet is that the simplest useful loop is skills, CLI retrieval, candidate review, and status validation.

---

## Correction Feedback Loop

Project bootstrap must teach agents to turn corrections into institutional memory.

`sundial init` appends this rule to the project's agent instruction file, such as `AGENTS.md`, `AGENT.md`, or `CLAUDE.md`:

```markdown
If you make a mistake and are corrected by the user (either in design, patterns, implementation choices, or structure), check for a DR that would have covered that mistake. If no DR exists, propose a new DR to cover this.
```

This closes an important loop: when the engineer corrects the model, the correction should either map to existing precedent or become a candidate for future precedent.

This rule applies broadly. A user message during design, implementation, review, debugging, or cleanup may contain a durable decision. Sundial should bias toward asking "is this reusable guidance?" and recording a candidate when the answer might be yes.

---

## Portability Model

Sundial's portable core is:

1. Skills.
2. CLI.
3. File-backed DR store with a candidate lifecycle.

The integration tiers are:

- **Skills + CLI**: most portable baseline. Review checklists run inside the main skill workflow.
- **Optional adapters**: MCP, hooks, editor integrations, and CI jobs may wrap the CLI later, but governance logic must remain exercisable through skills plus CLI.

The VS Code extension is the human stewardship surface. It is not the source of truth; the CLI and `sundial/` store are.

---

## First-Version Capture Policy

A **decision type** is a category of decision: architectural choice, implementation pattern, dependency selection, edge-case handling, or test strategy.

For the first version, Sundial does not need configurable agency levels. The default policy is deliberately simple:

- If accepted DRs cover the choice, follow them and cite them.
- If the agent encounters a consequential choice not covered by accepted DRs, create a candidate.
- Leave candidate DRs in Sundial for engineer review before they become precedent.
- If the user corrects the agent, check whether an accepted DR should have prevented the mistake. If none exists, create a DR candidate.
- If skill review or status validation finds a reusable decision or pattern, create a candidate.

The goal is to validate the core memory loop before adding knobs. Per-dimension approval levels, configurable supervision modes, and stricter enforcement policies can come later if the simple policy is too noisy or too permissive.

---

## Prior Art

**Cline's Memory Bank** provides persistent structured memory across sessions and shows that engineers will engage with explicit review checkpoints. Its deficits are the lack of formal decision indexing and all-or-nothing oversight.

**Amazon Q's AI-DLC** proves adaptive rigor works: deeper checkpoints for more complex tasks, clarifying questions for ambiguity, and traceable review history. Sundial differs by centering engineer authority rather than agent-directed process.

**Knowledge-agent patterns** show the value of logging assumptions and feeding them back into future work. Sundial makes the engineer's decision, not the agent's assumption, the durable unit.

**ADR-driven development** provides the strongest conceptual base. Sundial broadens ADRs into DRs because agents need guidance on implementation patterns, testing strategy, dependency choices, and error-handling decisions too.

**Human-in-the-loop research such as HULA** supports the claim that human guidance matters more as tasks become more complex. Sundial pushes beyond human-in-the-loop toward human-in-control.

---

## Unknowns

**Skill reliability**: Will agents invoke and follow `decision-aware-design` and `decision-aware-implement` reliably for consequential work?

**Candidate capture quality**: Will agents capture the right decisions without flooding the engineer with trivial candidates?

**Review timing**: When should implementation run code-review checks: after meaningful slices, before tests, before final response, or based on risk signals?

**DR consultation impact**: Does accepted DR context measurably change agent output, or do agents consult it and ignore it?

**Review cadence**: When should candidate review happen inline, after a task, or in a periodic stewardship pass?

**Reference anchors**: Function/class anchors are more stable than line numbers, but symbol moves and renames still need graceful degradation.

**Memory effectiveness**: Does the rate of required human intervention decrease as accepted DRs accumulate, or do candidates keep growing without reducing future ambiguity?

---

## Implementation

For the implementation plan - repository store, candidate lifecycle, skills, portability tiers, VS Code Candidate Inbox, and phased delivery - see [IMPLEMENTATION_APPROACH.md](IMPLEMENTATION_APPROACH.md).

Supplementary specs:

- [CLI_SPEC.md](CLI_SPEC.md) defines the `sundial` CLI surface.
- [DR_SPEC.md](DR_SPEC.md) defines the Decision Record format, tag vocabulary, and staged detail model.
