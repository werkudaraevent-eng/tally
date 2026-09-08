@AGENTS.md

<!-- antislop:start -->
## antislop

For UI, copy, or layout work, load the antislop core first by running `/antislop` (skill file at `~/.claude/skills/antislop/SKILL.md`). It is a filter against generic AI-generated UI. It is not a source of design direction: that lives in `DESIGN.md`, which is authoritative for palette, typography, motion tier, and the calm/expressive split per screen.

Sub-skills (`antislop-ui`, `antislop-copywriting`, `antislop-human`, `antislop-layoutmobile`, `antislop-code`) are not installed in this project. Add each one under `skills/<name>/SKILL.md` from the release matching the core, then list it here.

Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->
