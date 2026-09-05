// ClawdBot TUI Launcher — Lobster-themed terminal UI (FunPump + Cheshire + Solana).
// Uses tview for a rich interactive experience.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
)

const (
	clawdGreen  = "#14F195"
	clawdPurple = "#9945FF"
	clawdTeal   = "#00D4FF"
	clawdAmber  = "#FFAA00"
	clawdRed    = "#FF4060"
	clawdDim    = "#556680"

	// Product hosts — never clawdcode.net
	hostFunPump      = "https://funpump.ai"
	hostCheshire     = "https://cheshireterminal.ai"
	hostAgentHub     = "https://cheshireterminal.ai/agents"
	hostForge        = "https://cheshireterminal.ai/agents/forge"
	hostZeroClawd    = "https://cheshireterminal.ai/zeroclawd"
	hostAgentsNpm    = "https://www.npmjs.com/package/cheshire-terminal-agents"
	hostAgentsRepo   = "https://github.com/Solizardking/Cheshire-Terminal-Agents"
	hostSkillHubRepo = "https://github.com/Solizardking/skillhub-main"

	// RH mainnet pins (align with go-bot skills + FunPump product)
	addrLaunchpadV3 = "0x27f27F998fdBa2a38C136Bb3E7a8BA43155798Cd"
	addrBonding     = "0x6344a4c108b8fe03e9d79523ab0ac588a45cd092"
	addrIdentity    = "0x70361a37951d66f8c44cfb45873df2ba8b9fc950"
	addrReputation  = "0x8a4154a6c1ee44b4b790948f9613e3fb934628ff"
	addrValidation  = "0x020d053040da31195e5f9a992b8eda663dbb073b"
)

const lobsterArt = `[#FF4060]
              ██████╗████████████████████████████╗
             ██╔═══████╔═══════════════════════████╗
            ██║   ████║  [#14F195]🦞 CLAWDBOT[#FF4060]           ████║
           ██║   ████║  [#00D4FF]FunPump · Cheshire · Solana[#FF4060] ████║
          ██║   ████║  [#9945FF]funpump.ai · RH 4663[#FF4060]    ████║
         ██║   ████║  [#FFAA00]$CLAWD · ZK · Launch[#FF4060]    ████║
        ██║   ████╚═══════════════════════════████║
       ██║   ████████████████████████████████████║
      ██╔╝  /|      __                      ████║
     ██╔╝  / |   ,-~ /                     ████║
    ██╔╝  Y :|  //  /                     ████║
   ██╔╝   | jj /( .^                    ████║
  ██╔╝    >-"~"-v"                     ████║
 ██╔╝    /       Y   [#14F195]OODA LOOP[#FF4060]       ████║
██╔╝    jo  o    |   [#14F195]ACTIVE[#FF4060]          ████║
██║     ( ~T~     j                   ████║
██║      >._-' _./                  ████║
██╚══════/═══"~"══|════════════════████╝
 ╚══════Y═════_,══|═══════════════██╝
         /| ;-"~ _  l
        / l/ ,-"~    \
        \//\/      .- \
         Y        /    Y[-]
`

func main() {
	app := tview.NewApplication()

	// ── Header ───────────────────────────────────────────────
	header := tview.NewTextView().
		SetDynamicColors(true).
		SetTextAlign(tview.AlignCenter).
		SetText(fmt.Sprintf("[%s]CLAWDBOT[%s] [%s]GO[%s] [%s]:: FunPump · Cheshire · %s[-]",
			clawdGreen, clawdPurple, clawdTeal, "", clawdDim, time.Now().Format("15:04:05")))
	header.SetBackgroundColor(tcell.ColorBlack)
	header.SetBorderPadding(0, 0, 2, 2)

	// ── Lobster Art Panel ────────────────────────────────────
	artView := tview.NewTextView().
		SetDynamicColors(true).
		SetText(lobsterArt)
	artView.SetBackgroundColor(tcell.ColorBlack)
	artView.SetBorder(true).
		SetBorderColor(tcell.NewRGBColor(20, 241, 149)).
		SetTitle(fmt.Sprintf(" [%s]🦞 CLAWDBOT · FUNPUMP[-] ", clawdGreen)).
		SetTitleAlign(tview.AlignCenter)

	// ── Menu ─────────────────────────────────────────────────
	menuItems := []struct {
		label string
		desc  string
		cmd   string
	}{
		{"🤖 Agent Chat", "Interactive chat with ClawdBot AI", "agent"},
		{"🔄 OODA Loop", "Start autonomous trading cycle", "ooda"},
		{"💰 Wallet", "Solana wallet info & balance", "solana wallet"},
		{"🌐 Trending", "Birdeye trending tokens", "solana trending"},
		{"🔬 Research", "Deep research a token", "solana research So11111111111111111111111111111111111111112"},
		{"🧾 DAS Owner", "Helius DAS assets by owner", "solana das owner-assets"},
		{"🪙 SPL Supply", "Helius SPL token supply", "solana spl token-supply So11111111111111111111111111111111111111112"},
		{"⚡ RPC Ping", "Helius generic RPC getSlot", "solana spl rpc getSlot --params '[]'"},
		{"🚀 FunPump Launch", "Open launchpad skills + pins (RH 4663)", "catalog skills rh-launch"},
		{"🪪 Agent Registries", "ERC-8004 identity / reputation / validation", "catalog skills cheshire-agent"},
		{"🦈 ZK / Omni", "List zk + zk-omni skills", "catalog skills zk"},
		{"📦 Catalog", "List all local skills", "catalog skills"},
		{"📊 Status", "System status & health", "status"},
		{"🛠  Onboard", "Initialize config & workspace", "onboard"},
		{"🧬 Agent DNA", "Generate or inspect starter DNA", "dna show"},
		{"🎛  Hardware", "Scan Modulino I2C sensors", "hardware scan"},
		{"⚙  Gateway", "Start multi-channel gateway", "gateway"},
		{"📜 Version", "Version & build info", "version"},
	}

	menu := tview.NewList()
	menu.SetBackgroundColor(tcell.ColorBlack)
	menu.SetBorder(true).
		SetBorderColor(tcell.NewRGBColor(153, 69, 255)).
		SetTitle(fmt.Sprintf(" [%s]◆ LAUNCH PAD[-] ", clawdPurple)).
		SetTitleAlign(tview.AlignLeft)
	menu.SetHighlightFullLine(true)
	menu.SetSelectedBackgroundColor(tcell.NewRGBColor(20, 241, 149))
	menu.SetSelectedTextColor(tcell.ColorBlack)
	menu.SetMainTextColor(tcell.NewRGBColor(200, 216, 232))
	menu.SetSecondaryTextColor(tcell.NewRGBColor(85, 102, 128))

	for i, item := range menuItems {
		cmdCopy := item.cmd
		labelCopy := item.label
		shortcut := rune('a' + i)
		if i >= 26 {
			shortcut = 0
		}
		menu.AddItem(item.label, item.desc, shortcut, func() {
			// Special in-TUI panels that don't shell out
			if cmdCopy == "catalog skills rh-launch" {
				showLaunchPanel(app, layoutRoot(app))
				return
			}
			if cmdCopy == "catalog skills cheshire-agent" {
				showRegistriesPanel(app, layoutRoot(app))
				return
			}
			_ = labelCopy
			app.Stop()
			runClawdBotCommand(cmdCopy)
		})
	}

	menu.AddItem("🚪 Exit", "Quit the launcher", 'q', func() {
		app.Stop()
	})

	// ── Status Panel ─────────────────────────────────────────
	statusView := tview.NewTextView().
		SetDynamicColors(true)
	statusView.SetBackgroundColor(tcell.ColorBlack)
	statusView.SetBorder(true).
		SetBorderColor(tcell.NewRGBColor(0, 212, 255)).
		SetTitle(fmt.Sprintf(" [%s]SYSTEM STATUS[-] ", clawdTeal)).
		SetTitleAlign(tview.AlignLeft)

	updateStatus(statusView)

	// ── Info Bar ─────────────────────────────────────────────
	infoBar := tview.NewTextView().
		SetDynamicColors(true).
		SetTextAlign(tview.AlignCenter).
		SetText(fmt.Sprintf("[%s]$CLAWD · zeroclawd · agents · forge · funpump · RH 4663 · zk-omni[-]", clawdDim))
	infoBar.SetBackgroundColor(tcell.ColorBlack)

	// ── Layout ───────────────────────────────────────────────
	leftPanel := tview.NewFlex().
		SetDirection(tview.FlexRow).
		AddItem(artView, 24, 0, false).
		AddItem(statusView, 0, 1, false)

	mainContent := tview.NewFlex().
		AddItem(leftPanel, 0, 1, false).
		AddItem(menu, 48, 0, true)

	layout := tview.NewFlex().
		SetDirection(tview.FlexRow).
		AddItem(header, 1, 0, false).
		AddItem(mainContent, 0, 1, true).
		AddItem(infoBar, 1, 0, false)

	// stash root for modal panels
	app.SetRoot(layout, true).
		EnableMouse(true).
		SetFocus(menu)

	// Update status periodically
	go func() {
		for {
			time.Sleep(5 * time.Second)
			app.QueueUpdateDraw(func() {
				updateStatus(statusView)
			})
		}
	}()

	if err := app.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// layoutRoot is a no-op helper placeholder for future modal navigation.
func layoutRoot(_ *tview.Application) tview.Primitive {
	return nil
}

func showLaunchPanel(app *tview.Application, _ tview.Primitive) {
	text := fmt.Sprintf(`[%s]FunPump launchpads[%s]  RH mainnet 4663

  UI:          %s/launch
  V3 API:      %s/api/launchpad/v3
  Tokens API:  %s/api/launchpad/tokens

  V3 factory:  %s
  Bonding:     %s

  Skills:      rh-launchpad-v3 · rh-bonded-launch
  Paths:       go-bot/skills/ · robinhood-agents/skills/
`, clawdGreen, "", hostFunPump, hostFunPump, hostFunPump, addrLaunchpadV3, addrBonding)
	app.Stop()
	fmt.Print(colorizeConsole(text))
}

func showRegistriesPanel(app *tview.Application, _ tview.Primitive) {
	text := fmt.Sprintf(`[%s]Cheshire agent registries[%s]  ERC-8004 · RH 4663

  Clawd Bot:  %s
  Agent hub:   %s
  Forge:       %s
  Terminal:    %s
  npm:         %s
  GitHub:      %s
  SkillHub:    %s

  Identity:    %s
  Reputation:  %s
  Validation:  %s

  Skills: cheshire-agent-identity-registry
          cheshire-agent-reputation-registry
          cheshire-agent-validation-registry
          cheshire-agent-registries · cheshire-zk-omni

  Deploy JSON: robinhood-agents/deployments/agent-registries-mainnet-4663.json
`, clawdGreen, "", hostZeroClawd, hostAgentHub, hostForge, hostCheshire,
		hostAgentsNpm, hostAgentsRepo, hostSkillHubRepo,
		addrIdentity, addrReputation, addrValidation)
	app.Stop()
	fmt.Print(colorizeConsole(text))
}

func colorizeConsole(s string) string {
	// Map a few tview tags to ANSI for post-exit print
	repl := []struct{ a, b string }{
		{"[" + clawdGreen + "]", "\x1b[32m"},
		{"[" + clawdPurple + "]", "\x1b[35m"},
		{"[" + clawdTeal + "]", "\x1b[36m"},
		{"[" + clawdAmber + "]", "\x1b[33m"},
		{"[" + clawdDim + "]", "\x1b[2m"},
		{"[-]", "\x1b[0m"},
	}
	out := s
	for _, r := range repl {
		out = strings.ReplaceAll(out, r.a, r.b)
	}
	return out + "\x1b[0m\n"
}

func updateStatus(view *tview.TextView) {
	now := time.Now()
	goos := runtime.GOOS + "/" + runtime.GOARCH

	status := fmt.Sprintf(`[%s]Runtime[%s]
  Go:        %-20s
  Platform:  %-20s
  Time:      %s

[%s]Solana Stack[%s]
  Helius:    %s
  Network:   %s
  Birdeye:   %s
  Jupiter:   %s
  Aster:     %s
  DAS:       %s
  SPL/RPC:   %s

[%s]FunPump / Cheshire[%s]
  Zero:      cheshireterminal.ai/zeroclawd
  Agents:    cheshireterminal.ai/agents
  Forge:     cheshireterminal.ai/agents/forge
  FunPump:   funpump.ai
  npm:       cheshire-terminal-agents
  GitHub:    Solizardking/Cheshire-Terminal-Agents
  SkillHub:  Solizardking/skillhub-main
  Launch V3: %s…
  Identity:  %s…

[%s]Robinhood Chain (4663)[%s]
  Blockscout: %s
  RH RPC:     %s
  Skills:     web3-dev · rh-launchpad-v3 · swap-*

[%s]Hardware[%s]
  Target:    NVIDIA Orin Nano
  I2C Bus:   /dev/i2c-1
  Modulinos: (scan on connect)

[%s]Memory[%s]
  Vault:     ~/.clawdbot/workspace/vault
  Skills:    %s
  Supabase:  %s
`,
		clawdGreen, "",
		"Go 1.25+",
		goos,
		now.Format("15:04:05 MST"),
		clawdAmber, "",
		envStatus("HELIUS_API_KEY"),
		envValue("HELIUS_NETWORK", "mainnet"),
		envStatus("BIRDEYE_API_KEY"),
		envStatus("JUPITER_API_KEY"),
		envStatus("ASTER_API_KEY"),
		envStatus("HELIUS_API_KEY"),
		envStatus("HELIUS_API_KEY"),
		clawdGreen, "",
		shortAddr(addrLaunchpadV3),
		shortAddr(addrIdentity),
		clawdAmber, "",
		envStatus("BLOCKSCOUT_API_KEY"),
		envStatus("RH_RPC_URL"),
		clawdTeal, "",
		clawdPurple, "",
		skillsPathHint(),
		envStatus("SUPABASE_URL"),
	)

	view.SetText(status)
}

func shortAddr(a string) string {
	if len(a) < 12 {
		return a
	}
	return a[:6] + "…" + a[len(a)-4:]
}

func skillsPathHint() string {
	// Prefer bundled go-bot/skills next to binary / cwd
	candidates := []string{
		"skills",
		filepath.Join("go-bot", "skills"),
		filepath.Join("..", "skills"),
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			return c
		}
	}
	if v := os.Getenv("CLAWDBOT_SKILLS_DIR"); v != "" {
		return v
	}
	return "(set CLAWDBOT_SKILLS_DIR)"
}

func envStatus(key string) string {
	if os.Getenv(key) != "" {
		return fmt.Sprintf("[%s]✓ configured[-]", clawdGreen)
	}
	return fmt.Sprintf("[%s]✗ not set[-]", clawdRed)
}

func envValue(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		v = fallback
	}
	return fmt.Sprintf("[%s]%s[-]", clawdTeal, v)
}

func runClawdBotCommand(subcmd string) {
	parts := strings.Fields(subcmd)
	args := append([]string{}, parts...)

	binary := "clawdbot"
	if _, err := exec.LookPath(binary); err != nil {
		binary = "./clawdbot"
	}

	cmd := exec.Command(binary, args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = cmd.Run()
}
