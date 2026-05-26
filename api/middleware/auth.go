package middleware

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"ajayraj.co/api/db"
)

// CtxKey is the type for context keys set by this package.
type CtxKey int

const (
	// UserIDKey is the context key for the authenticated user's ID.
	UserIDKey CtxKey = iota
)

// RequireAuth wraps a handler, validating the session cookie and injecting
// the user ID into the request context. Returns 401 if the session is missing
// or expired.
func RequireAuth(d *db.DB, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("cs_session")
		if err != nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		var userID int64
		var expiresAt time.Time
		err = d.QueryRow(
			`SELECT user_id, expires_at FROM sessions WHERE token = ?`,
			cookie.Value,
		).Scan(&userID, &expiresAt)

		if err == sql.ErrNoRows || time.Now().After(expiresAt) {
			if err == nil {
				// Clean up the expired session row
				d.Exec(`DELETE FROM sessions WHERE token = ?`, cookie.Value)
			}
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		if err != nil {
			http.Error(w, `{"error":"server error"}`, http.StatusInternalServerError)
			return
		}

		ctx := context.WithValue(r.Context(), UserIDKey, userID)
		next(w, r.WithContext(ctx))
	}
}
