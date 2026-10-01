// duckdb_unavailable.go — the real github.com/marcboeker/go-duckdb driver is
// NOT vendored in this repo (offline builds cannot fetch it), so an in-process
// DuckDB engine is unavailable. Analytics queries are served by proxying to
// the Python lakehouse-v2 service via LAKEHOUSE_API_URL (see proxy.go).
//
// To restore a local in-process DuckDB engine, vendor go-duckdb and add a
// duckdb_real.go behind the `duckdb` build tag providing openDuckDB.
//
// This file deliberately FAILS LOUD instead of registering a stub driver that
// silently returns empty results (A3-Gap-4).
package lakehouse

import (
	"database/sql"
	"errors"
)

// errDuckDBUnavailable is returned whenever code attempts to open an
// in-process DuckDB database in a build without the real driver.
var errDuckDBUnavailable = errors.New("lakehouse: duckdb driver not available in this build (go-duckdb not vendored); set LAKEHOUSE_API_URL to proxy to the lakehouse-v2 service")

// openDuckDB fails loud — no stub driver is registered.
func openDuckDB(path string) (*sql.DB, error) {
	return nil, errDuckDBUnavailable
}
