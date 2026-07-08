# Agent Workflow Rules

## Before Editing

- Read the existing module closest to the requested change.
- Check the domain contract before changing an implementation.
- Check `ErrorCode` before inventing new errors.
- Check `prisma/models` before adding repository methods.
- Create a plan showing what will be edited and why before implementing.

## When Implementing

- Add or update DTO validation first for new API inputs.
- Add or extend domain contracts before concrete repositories.
- Implement application logic using `Result`.
- Map errors in controllers.
- Register providers in modules.
- After each plan step is implemented, stop and wait for approval.

## Before Finishing

- Run the smallest useful verification command.
- Mention any command that could not be run.
- Keep final notes focused on changed files and behavior.

## Things Not To Do

- Do not call Prisma from controllers or application services.
- Do not throw `BadRequestException`, `ConflictException`, etc. from services/entities/repositories.
- Do not return raw passwords or internal numeric IDs from API responses.
- Do not bypass DTO validation with plain objects.
- Do not create a new folder style if the current feature-based layout can handle it.
- Do not mix unrelated cleanup with feature work.
- Do not change Docker, Prisma migrations, or auth behavior unless the task requires it.
