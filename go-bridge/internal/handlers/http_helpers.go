// Package handlers — shared HTTP proxy helpers used across all handler files.
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// proxyPost marshals body as JSON and POSTs it to the given URL,
// returning the decoded response map.
func proxyPost(ctx context.Context, url string, body interface{}) (map[string]interface{}, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("proxyPost marshal: %w", err)
	}
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, fmt.Errorf("proxyPost new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	internalKey := os.Getenv("MIDDLEWARE_INTERNAL_KEY")
	if internalKey != "" {
		req.Header.Set("X-Internal-Key", internalKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("proxyPost %s: %w", url, err)
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("proxyPost decode: %w", err)
	}
	return result, nil
}

// proxyGet performs a GET request to the given URL and returns the decoded response map.
func proxyGet(ctx context.Context, url string) (map[string]interface{}, error) {
client := &http.Client{Timeout: 30 * time.Second}
req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
if err != nil {
return nil, fmt.Errorf("proxyGet new request: %w", err)
}
internalKey := os.Getenv("MIDDLEWARE_INTERNAL_KEY")
if internalKey != "" {
req.Header.Set("X-Internal-Key", internalKey)
}
resp, err := client.Do(req)
if err != nil {
return nil, fmt.Errorf("proxyGet %s: %w", url, err)
}
defer resp.Body.Close()
var result map[string]interface{}
if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
return nil, fmt.Errorf("proxyGet decode: %w", err)
}
return result, nil
}

// writeJSON encodes v as JSON and writes it to w with the given HTTP status code.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(status)
json.NewEncoder(w).Encode(v)
}
