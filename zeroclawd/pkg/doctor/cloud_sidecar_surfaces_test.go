package doctor

import (
	"testing"

	"github.com/8bitlabs/clawdbot/pkg/config"
)

// Shipped doctor IDs that overlap Clawd Cloud surfaces. Cloud MCP is
// Helius/DFlow/Jupiter/Birdeye/clawd-mcp; go-bot MCP stays Blockscout.
func TestRunEmitsZKBlockscoutVulcanCheckIDs(t *testing.T) {
	report := Run(Options{Config: config.DefaultConfig()})
	got := map[string]Check{}
	for _, c := range report.Checks {
		got[c.ID] = c
	}
	for _, id := range []string{"zk.surface", "connectors.blockscout_mcp", "perps.vulcan"} {
		if _, ok := got[id]; !ok {
			t.Fatalf("missing check %s", id)
		}
	}
	if got["connectors.blockscout_mcp"].Label != "Blockscout MCP" {
		t.Fatalf("blockscout label = %q", got["connectors.blockscout_mcp"].Label)
	}
}
