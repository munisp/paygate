// proxy.go — forward lakehouse analytics requests to the Python
// lakehouse-v2 service when LAKEHOUSE_API_URL is configured (A3-Gap-4).
//
// Fail-loud semantics: when LAKEHOUSE_API_URL is unset AND no in-process
// DuckDB engine is available, handlers return 503 with an explicit error
// instead of silently returning empty results.
package lakehouse

import (
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

// proxyHTTPClient is a dedicated client with a bounded timeout for analytics
// upstream calls (long-running OLAP queries get 60s).
var proxyHTTPClient = &http.Client{Timeout: 60 * time.Second}

// lakehouseAPIURL returns the configured lakehouse-v2 base URL, or "".
func lakehouseAPIURL() string {
	return strings.TrimRight(os.Getenv("LAKEHOUSE_API_URL"), "/")
}

// proxyToLakehouseV2 forwards the request to lakehouse-v2 at upstreamPath.
// Returns false when LAKEHOUSE_API_URL is not configured (caller falls back
// to the local engine / fail-loud path).
func proxyToLakehouseV2(w http.ResponseWriter, r *http.Request, upstreamPath string) bool {
	base := lakehouseAPIURL()
	if base == "" {
		return false
	}
	target := base + upstreamPath
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		slog.Error("[lakehouse] proxy build request", "err", err, "target", target)
		http.Error(w, `{"error":"lakehouse proxy build error"}`, http.StatusBadGateway)
		return true
	}
	for _, h := range []string{"Content-Type", "Authorization", "X-Internal-Key", "X-Request-Id"} {
		if v := r.Header.Get(h); v != "" {
			req.Header.Set(h, v)
		}
	}
	resp, err := proxyHTTPClient.Do(req)
	if err != nil {
		slog.Error("[lakehouse] upstream error", "err", err, "target", target)
		http.Error(w, `{"error":"lakehouse upstream unavailable"}`, http.StatusBadGateway)
		return true
	}
	defer resp.Body.Close()
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
	return true
}

// failLoud writes the 503 response used when neither a local DuckDB engine
// nor LAKEHOUSE_API_URL proxying is configured.
func failLoud(w http.ResponseWriter) {
	slog.Error("[lakehouse] no analytics backend configured — failing loud")
	writeJSON(w, http.StatusServiceUnavailable, map[string]any{
		"error": "lakehouse backend not configured",
		"hint":  "set LAKEHOUSE_API_URL to proxy to the lakehouse-v2 service, or build with the duckdb tag and a vendored go-duckdb driver",
	})
}
