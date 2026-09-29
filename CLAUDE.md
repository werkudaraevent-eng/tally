@AGENTS.md

<!-- antislop:start -->
## antislop

For UI, copy, or layout work, load the antislop core first by running `/antislop`. It is a filter against generic AI-generated UI. It is not a source of design direction: that lives in `DESIGN.md`, which is authoritative for palette, typography, motion tier, and the calm/expressive split per screen.

antislop is enabled as a plugin in `.claude/settings.json` (marketplace `miqdadbadjuber/anti-slop`, plugin `antislop@anti-slop`), so local and cloud sessions both load it. The plugin ships the core and every sub-skill: `antislop-ui`, `antislop-copywriting`, `antislop-human`, `antislop-layoutmobile`, `antislop-code`. Load the sub-skill that matches the task alongside the core.

Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->
