package release

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSolanaMobileAppShipsMWASecureCache(t *testing.T) {
	root, err := RepoRootFromWD()
	if err != nil {
		t.Skip(err.Error())
	}
	app := filepath.Join(root, "mobile", "App.tsx")
	cache := filepath.Join(root, "mobile", "src", "secure-store-cache.ts")
	pkg := filepath.Join(root, "mobile", "package.json")
	for _, p := range []string{app, cache, pkg, filepath.Join(root, "mobile", "polyfill.js")} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("missing Solana Mobile artifact: %s", p)
		}
	}
	appSrc, err := os.ReadFile(app)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(appSrc), "MobileWalletProvider") {
		t.Fatal("App.tsx must wrap MobileWalletProvider")
	}
	if !strings.Contains(string(appSrc), "createSecureStoreCache") {
		t.Fatal("App.tsx must pass the expo-secure-store cache")
	}
	cacheSrc, err := os.ReadFile(cache)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"expo-secure-store", "cacheReviver", "get()", "set(", "clear()"} {
		if !strings.Contains(string(cacheSrc), want) {
			t.Errorf("secure-store-cache.ts missing %q", want)
		}
	}
	pkgSrc, err := os.ReadFile(pkg)
	if err != nil {
		t.Fatal(err)
	}
	body := string(pkgSrc)
	if strings.Contains(body, "private.pem") || strings.Contains(body, ".env.local") {
		t.Fatal("mobile package.json must not reference secrets")
	}
	if !strings.Contains(body, "@wallet-ui/react-native-web3js") {
		t.Fatal("mobile package.json missing MWA provider")
	}
}
