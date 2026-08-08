"use strict";

// The one sessionId sanitization every hush temp path shares. The id becomes a
// single path segment, so anything that isn't [A-Za-z0-9-] (path separators and
// traversal included) is flattened to an underscore. All call sites must use
// this helper — never inline the expression again (see CLAUDE.md: sanitization
// lives here so cleanup and claiming land on the same name).
//
// win32 folds the case: `ABCD1234` and `abcd1234` are one directory on NTFS,
// so distinct-case ids have to resolve to the same name here too — otherwise a
// cleanup for one id deletes the other's live files.
function sanitizeSessionId(sessionId) {
  return String(sessionId || "unknown").replace(/[^a-zA-Z0-9-]/g, "_");
}

module.exports = { sanitizeSessionId };