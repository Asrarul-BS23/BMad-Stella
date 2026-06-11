'use strict';

/**
 * Prompt for codebase scan — identifies folders containing shared/reusable code.
 * Called once at install time by pattern-scanner.js.
 */
function buildScanPatternsPrompt({ projectTree }) {
  return `You are scanning a software project to identify reusable code locations — folders or individual files that developers must inherit, extend, or follow rather than recreate.

PROJECT STRUCTURE:
${projectTree}

Identify code meant to be reused across the project — NOT module-specific business logic.

Look for:
- Shared utilities and helper functions (return the folder)
- Base or abstract classes meant to be extended — e.g. BaseApiController.ts, GenericRepository.ts (return the specific file if it is the only reusable thing in its folder)
- Shared middleware, interceptors, guards, filters (return the folder)
- Framework wrappers used project-wide — e.g. src/core/http-client.ts (return the file)
- Shared DTOs, interfaces, types used project-wide (return the folder)
- Common constants or enums used across multiple modules (return the folder)

Return a JSON array of relative paths from project root — folder path OR individual file path:
- Use a folder path when multiple files in the folder are reusable: "src/common/utils"
- Use a file path when only one file in the folder is the reusable pattern: "src/core/base-api.controller.ts"

["src/common", "src/base/generic.repository.ts", "src/shared/utils"]

Rules:
- Relative path from project root — no leading slash
- Maximum 10 entries — pick the most clearly reusable
- Exclude: module-specific folders, test folders, config folders, migration folders, generated code
- Return [] if no clear reusable code identified
- Return ONLY valid JSON array, no other text`;
}

module.exports = { buildScanPatternsPrompt };
