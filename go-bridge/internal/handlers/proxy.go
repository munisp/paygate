package handlers

import (
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
)

// ProxyToService returns an http.HandlerFunc that reverse-proxies a request
// to an upstream microservice. The upstream base URL is read from the given
// environment variable; if unset, fallbackURL is used. The path suffix is
// appended to the upstream base URL.
func ProxyToService(envKey, fallbackURL, pathSuffix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		upstream := os.Getenv(envKey)
		if upstream == "" {
			upstream = fallbackURL
		}
		upstream = strings.TrimRight(upstream, "/")
		targetURL := upstream + pathSuffix

		// Forward query string
		if r.URL.RawQuery != "" {
			targetURL += "?" + r.URL.RawQuery
		}

		req, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, r.Body)
		if err != nil {
			slog.Error("[proxy] build request", "err", err, "target", targetURL)
			http.Error(w, `{"error":"proxy build error"}`, http.StatusBadGateway)
			return
		}

		// Copy relevant headers
		for _, h := range []string{"Content-Type", "Authorization", "X-Request-Id", "X-Merchant-Id"} {
			if v := r.Header.Get(h); v != "" {
				req.Header.Set(h, v)
			}
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			slog.Error("[proxy] upstream error", "err", err, "target", targetURL)
			http.Error(w, `{"error":"upstream unavailable"}`, http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		// Copy response headers and status
		for k, vs := range resp.Header {
			for _, v := range vs {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body) //nolint:errcheck
	}
}
