// duckdb_stub.go — stub DuckDB driver for environments without CGO / DuckDB libs.
// In production, replace this file with duckdb_real.go that imports
// github.com/marcboeker/go-duckdb and uses sql.Open("duckdb", path).

package lakehouse

import (
	"database/sql"
	"database/sql/driver"
	"fmt"
	"io"
	"sync"
)

// stubDriver is a minimal database/sql driver that returns empty results.
type stubDriver struct{}

type stubConn struct{}
type stubStmt struct{ query string }
type stubRows struct{ done bool }
type stubResult struct{}
type stubTx struct{}

func (d stubDriver) Open(name string) (driver.Conn, error) { return &stubConn{}, nil }

func (c *stubConn) Prepare(query string) (driver.Stmt, error) {
	return &stubStmt{query: query}, nil
}
func (c *stubConn) Close() error                          { return nil }
func (c *stubConn) Begin() (driver.Tx, error)             { return &stubTx{}, nil }
func (t *stubTx) Commit() error                           { return nil }
func (t *stubTx) Rollback() error                         { return nil }
func (s *stubStmt) Close() error                          { return nil }
func (s *stubStmt) NumInput() int                         { return -1 }
func (s *stubStmt) Exec(args []driver.Value) (driver.Result, error) {
	return stubResult{}, nil
}
func (s *stubStmt) Query(args []driver.Value) (driver.Rows, error) {
	return &stubRows{}, nil
}
func (r stubResult) LastInsertId() (int64, error) { return 0, nil }
func (r stubResult) RowsAffected() (int64, error) { return 0, nil }
func (r *stubRows) Columns() []string             { return []string{} }
func (r *stubRows) Close() error                  { return nil }
func (r *stubRows) Next(dest []driver.Value) error {
	return io.EOF
}

var registerOnce sync.Once

func init() {
	registerOnce.Do(func() {
		sql.Register("duckdb", stubDriver{})
	})
}

// openDuckDB opens a DuckDB database using the stub driver.
// In production, swap this for the real go-duckdb driver.
func openDuckDB(path string) (*sql.DB, error) {
	db, err := sql.Open("duckdb", path)
	if err != nil {
		return nil, fmt.Errorf("duckdb stub open: %w", err)
	}
	return db, nil
}
