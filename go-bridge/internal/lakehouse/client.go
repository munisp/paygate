// Package lakehouse provides a DuckDB/Iceberg analytics client for PayGate (Wave 133).
//
// Architecture:
//   - DuckDB is used as the in-process OLAP engine for ad-hoc analytics queries.
//   - Iceberg table metadata is stored in S3 (or local path in dev) and read via
//     DuckDB's iceberg extension.
//   - This package exposes a thin HTTP handler layer consumed by the Go bridge.
//
// Routes registered in main.go:
//   POST /v1/lakehouse/query   — run an ad-hoc DuckDB SQL query (admin only)
//   GET  /v1/lakehouse/tables  — list available Iceberg tables
//   POST /v1/lakehouse/export  — export query results as Parquet to S3

package lakehouse

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	// DuckDB driver — uses CGO; falls back to stub when unavailable.
	// Import is guarded by build tag in duckdb_real.go / duckdb_stub.go.
)

// ─── Config ───────────────────────────────────────────────────────────────────

// Config holds runtime configuration for the Lakehouse client.
type Config struct {
	// DuckDBPath is the path to the DuckDB database file.
	// Use ":memory:" for ephemeral analytics (default).
	DuckDBPath string

	// IcebergWarehouse is the S3 URI or local path for Iceberg table metadata.
	// Example: s3://paygate-lakehouse/warehouse
	IcebergWarehouse string

	// MaxQueryDurationSecs caps long-running analytics queries.
	MaxQueryDurationSecs int
}

func DefaultConfig() Config {
	return Config{
		DuckDBPath:           os.Getenv("DUCKDB_PATH"),
		IcebergWarehouse:     os.Getenv("ICEBERG_WAREHOUSE"),
		MaxQueryDurationSecs: 30,
	}
}

// ─── Client ───────────────────────────────────────────────────────────────────

// Client is the Lakehouse analytics client.
type Client struct {
	cfg Config
	db  *sql.DB
	mu  sync.Mutex
}

var (
	globalClient *Client
	once         sync.Once
)

// Init initialises the global Lakehouse client.
func Init(cfg Config) error {
	var initErr error
	once.Do(func() {
		c, err := newClient(cfg)
		if err != nil {
			initErr = err
			return
		}
		globalClient = c
		slog.Info("[lakehouse] client initialised", "path", cfg.DuckDBPath, "warehouse", cfg.IcebergWarehouse)
	})
	return initErr
}

// Get returns the global Lakehouse client (nil if not initialised).
func Get() *Client {
	return globalClient
}

func newClient(cfg Config) (*Client, error) {
	if cfg.DuckDBPath == "" {
		cfg.DuckDBPath = ":memory:"
	}
	db, err := openDuckDB(cfg.DuckDBPath)
	if err != nil {
		return nil, fmt.Errorf("lakehouse: open duckdb: %w", err)
	}
	c := &Client{cfg: cfg, db: db}
	if err := c.bootstrap(); err != nil {
		return nil, fmt.Errorf("lakehouse: bootstrap: %w", err)
	}
	return c, nil
}

// bootstrap installs DuckDB extensions and creates base views.
func (c *Client) bootstrap() error {
	stmts := []string{
		"INSTALL httpfs; LOAD httpfs;",
		"INSTALL iceberg; LOAD iceberg;",
		"INSTALL parquet; LOAD parquet;",
	}
	for _, stmt := range stmts {
		if _, err := c.db.Exec(stmt); err != nil {
			// Extensions may already be installed — log and continue.
			slog.Debug("[lakehouse] bootstrap stmt skipped", "stmt", stmt, "err", err)
		}
	}
	return nil
}

// ─── Query ────────────────────────────────────────────────────────────────────

// QueryResult holds the result of an analytics query.
type QueryResult struct {
	Columns []string         `json:"columns"`
	Rows    []map[string]any `json:"rows"`
	RowCount int             `json:"row_count"`
	DurationMs int64         `json:"duration_ms"`
}

// Query executes a read-only DuckDB SQL query and returns results as JSON-serialisable rows.
func (c *Client) Query(ctx context.Context, sqlQuery string) (*QueryResult, error) {
	// Safety: reject mutating statements
	upper := strings.ToUpper(strings.TrimSpace(sqlQuery))
	for _, kw := range []string{"INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE"} {
		if strings.HasPrefix(upper, kw) {
			return nil, fmt.Errorf("lakehouse: mutating statements are not allowed")
		}
	}

	timeout := time.Duration(c.cfg.MaxQueryDurationSecs) * time.Second
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	start := time.Now()
	c.mu.Lock()
	rows, err := c.db.QueryContext(ctx, sqlQuery)
	c.mu.Unlock()
	if err != nil {
		return nil, fmt.Errorf("lakehouse: query: %w", err)
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("lakehouse: columns: %w", err)
	}

	var result []map[string]any
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, fmt.Errorf("lakehouse: scan: %w", err)
		}
		row := make(map[string]any, len(cols))
		for i, col := range cols {
			row[col] = vals[i]
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("lakehouse: rows: %w", err)
	}

	return &QueryResult{
		Columns:    cols,
		Rows:       result,
		RowCount:   len(result),
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

// ListTables returns the names of all Iceberg tables in the configured warehouse.
func (c *Client) ListTables(ctx context.Context) ([]string, error) {
	if c.cfg.IcebergWarehouse == "" {
		// Fallback: list DuckDB tables
		rows, err := c.db.QueryContext(ctx, "SHOW TABLES")
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var tables []string
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err == nil {
				tables = append(tables, name)
			}
		}
		return tables, nil
	}
	// Scan Iceberg warehouse for table directories
	q := fmt.Sprintf("SELECT table_name FROM iceberg_tables('%s')", c.cfg.IcebergWarehouse)
	res, err := c.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	var tables []string
	for _, row := range res.Rows {
		if name, ok := row["table_name"].(string); ok {
			tables = append(tables, name)
		}
	}
	return tables, nil
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

// QueryHandler handles POST /v1/lakehouse/query.
func QueryHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SQL string `json:"sql"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SQL == "" {
		http.Error(w, `{"error":"sql field is required"}`, http.StatusBadRequest)
		return
	}

	c := Get()
	if c == nil {
		// Lakehouse not configured — return informative stub response
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error":   "lakehouse not configured",
			"hint":    "Set DUCKDB_PATH env var to enable analytics queries",
			"columns": []string{},
			"rows":    []any{},
		})
		return
	}

	result, err := c.Query(r.Context(), req.SQL)
	if err != nil {
		slog.Error("[lakehouse] query error", "error", err)
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// TablesHandler handles GET /v1/lakehouse/tables.
func TablesHandler(w http.ResponseWriter, r *http.Request) {
	c := Get()
	if c == nil {
		writeJSON(w, http.StatusOK, map[string]any{"tables": []string{}, "configured": false})
		return
	}
	tables, err := c.ListTables(r.Context())
	if err != nil {
		slog.Error("[lakehouse] list tables error", "error", err)
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tables": tables, "configured": true})
}

// ExportHandler handles POST /v1/lakehouse/export — exports query results as Parquet.
func ExportHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SQL        string `json:"sql"`
		OutputPath string `json:"output_path"` // S3 URI or local path
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SQL == "" {
		http.Error(w, `{"error":"sql and output_path are required"}`, http.StatusBadRequest)
		return
	}

	c := Get()
	if c == nil {
		http.Error(w, `{"error":"lakehouse not configured"}`, http.StatusServiceUnavailable)
		return
	}

	outputPath := req.OutputPath
	if outputPath == "" {
		outputPath = fmt.Sprintf("/tmp/export_%d.parquet", time.Now().UnixMilli())
	}

	exportSQL := fmt.Sprintf("COPY (%s) TO '%s' (FORMAT PARQUET)", req.SQL, outputPath)
	c.mu.Lock()
	_, err := c.db.ExecContext(r.Context(), exportSQL)
	c.mu.Unlock()
	if err != nil {
		slog.Error("[lakehouse] export error", "error", err)
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "output_path": outputPath})
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(v); err != nil {
		http.Error(w, `{"error":"json encode failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(buf.Bytes())
}
