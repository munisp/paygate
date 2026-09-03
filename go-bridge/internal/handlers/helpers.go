package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"
)

// respondJSON writes a JSON response with the given status code.
func respondJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		json.NewEncoder(w).Encode(v)
	}
}

// respondError writes a JSON error response.
func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

// NotImplementedHandler returns a handler that honestly reports the endpoint
// as not implemented (501). Used instead of binding a route to a cross-wired
// (wrong) handler when no real implementation exists.
func NotImplementedHandler(feature string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusNotImplemented, map[string]string{
			"error":   "not_implemented",
			"feature": feature,
			"message": "this endpoint has no real implementation on the bridge; refusing to serve a cross-wired handler",
		})
	}
}

// getEnvOrDefault returns the environment variable value or a default.
func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// bytesReader wraps a byte slice as an io.Reader.
func bytesReader(b []byte) io.Reader {
	return bytes.NewReader(b)
}

// parseIntQuery parses an integer query parameter with a fallback default.
func parseIntQuery(r *http.Request, key string, defaultVal int) int {
	s := r.URL.Query().Get(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil || v < 1 {
		return defaultVal
	}
	return v
}
