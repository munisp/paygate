package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func okHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// TestAuthMiddleware_AcceptsBearer verifies Authorization: Bearer <key> auth.
func TestAuthMiddleware_AcceptsBearer(t *testing.T) {
	t.Setenv("BRIDGE_INTERNAL_KEY", "test-bridge-key-0123456789")
	h := authMiddleware(okHandler)

	req := httptest.NewRequest("POST", "/v1/wallets/debit", nil)
	req.Header.Set("Authorization", "Bearer test-bridge-key-0123456789")
	w := httptest.NewRecorder()
	h(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 with valid Bearer key, got %d", w.Code)
	}
}

// TestAuthMiddleware_AcceptsXInternalKey verifies X-Internal-Key header auth
// (spec #5: either header MUST be accepted).
func TestAuthMiddleware_AcceptsXInternalKey(t *testing.T) {
	t.Setenv("BRIDGE_INTERNAL_KEY", "test-bridge-key-0123456789")
	h := authMiddleware(okHandler)

	req := httptest.NewRequest("POST", "/v1/wallets/debit", nil)
	req.Header.Set("X-Internal-Key", "test-bridge-key-0123456789")
	w := httptest.NewRecorder()
	h(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 with valid X-Internal-Key, got %d", w.Code)
	}
}

// TestAuthMiddleware_RejectsWrongKey verifies fail-closed rejection.
func TestAuthMiddleware_RejectsWrongKey(t *testing.T) {
	t.Setenv("BRIDGE_INTERNAL_KEY", "test-bridge-key-0123456789")
	h := authMiddleware(okHandler)

	for _, tc := range []struct{ name, header, value string }{
		{"wrong bearer", "Authorization", "Bearer wrong-key"},
		{"wrong x-internal-key", "X-Internal-Key", "wrong-key"},
		{"no prefix bearer", "Authorization", "test-bridge-key-0123456789"}, // missing "Bearer " prefix
		{"empty", "", ""},
	} {
		req := httptest.NewRequest("POST", "/v1/wallets/debit", nil)
		if tc.header != "" {
			req.Header.Set(tc.header, tc.value)
		}
		w := httptest.NewRecorder()
		h(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s: expected 401, got %d", tc.name, w.Code)
		}
	}
}

// TestAuthMiddleware_FallsBackToMiddlewareKey verifies MIDDLEWARE_INTERNAL_KEY
// is accepted when BRIDGE_INTERNAL_KEY is unset.
func TestAuthMiddleware_FallsBackToMiddlewareKey(t *testing.T) {
	t.Setenv("BRIDGE_INTERNAL_KEY", "")
	t.Setenv("MIDDLEWARE_INTERNAL_KEY", "middleware-key-abc")
	h := authMiddleware(okHandler)

	req := httptest.NewRequest("POST", "/v1/wallets/debit", nil)
	req.Header.Set("X-Internal-Key", "middleware-key-abc")
	w := httptest.NewRecorder()
	h(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 with MIDDLEWARE_INTERNAL_KEY fallback, got %d", w.Code)
	}
}
