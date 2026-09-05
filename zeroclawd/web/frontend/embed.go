// Package frontenddist embeds the built Clawd Bot web console (web/frontend/dist).
// The clawdbot binary serves these files in-process so `clawdbot web` does not
// need a source checkout or `go run`.
package frontenddist

import "embed"

//go:embed all:dist
var DistFS embed.FS
