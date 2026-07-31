---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for this codebase. Document what they need to know: which files to touch for each task, code, testing, docs they might need to check, and how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about this repository or problem domain.

Announce at start: "I'm using the writing-plans skill to create the implementation plan."

Save plans to: `docs/plans/YYYY-MM-DD-<feature-name>.md`

User preferences for plan location override this default.

## Scope Check

If the spec covers multiple independent subsystems, suggest breaking it into separate plans, one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for.

- Design units with clear boundaries and well-defined interfaces.
- Prefer smaller, focused files over large files that do too much.
- In existing codebases, follow established patterns.
- If the codebase uses large files, do not unilaterally restructure.
- If a file being modified has grown unwieldy, include the split in the plan only when it helps the task.

## Bite-Sized Task Granularity

Each step should be one small action:

- Write the failing test.
- Run it to make sure it fails.
- Implement the minimal code to make the test pass.
- Run the tests and make sure they pass.
- Commit when the task is coherent.

## Plan Document Header

Every plan should start with this header:

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**

- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts`
- Test: `test/or/src/path/to/test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('describes the specific behavior', async () => {
  const result = await subject(input);

  expect(result).toEqual(expected);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- path-or-pattern`
Expected: FAIL for the specific missing behavior.

- [ ] **Step 3: Write minimal implementation**

```ts
// Show the actual implementation shape here.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- path-or-pattern`
Expected: PASS.

- [ ] **Step 5: Run useful verification**

Run: `npm run build`
Expected: PASS.

```

```
````

## No Placeholders

Never write:

- `TBD`, `TODO`, `implement later`, or `fill in details`.
- "Add appropriate error handling" without the actual behavior.
- "Add validation" without exact validation rules.
- "Write tests for the above" without concrete test cases.
- "Similar to Task N" instead of repeating necessary detail.
- Steps that describe code changes without showing enough code to execute them.
- References to types, functions, or methods not defined in any task or already present in the repo.

## Remember

- Use exact file paths.
- Include complete enough code for every code step.
- Include exact commands with expected results.
- Keep the plan scoped to the requested behavior.
- Prefer TDD for behavior changes.

## Self-Review

After writing the complete plan, review it before presenting it:

1. Spec coverage: every requirement maps to a task.
2. Placeholder scan: remove vague placeholders.
3. Type consistency: names and signatures match across tasks.
4. Verification: commands are realistic for this repository.

If you find issues, fix them inline before handing off the plan.
