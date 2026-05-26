package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"ajayraj.co/api/middleware"
	"golang.org/x/crypto/bcrypt"
)

type credReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// dummyHash is a pre-computed bcrypt hash used for constant-time login when
// the username doesn't exist, preventing username enumeration via timing.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-timing-placeholder"), 12)

// Register creates a new user account and returns a session cookie.
// POST /api/auth/register
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req credReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.Username) < 2 || len(req.Username) > 32 {
		jsonErr(w, "username must be 2–32 characters", http.StatusBadRequest)
		return
	}
	if len(req.Password) < 8 {
		jsonErr(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}

	var userID int64
	err = h.db.QueryRow(
		`INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id`,
		req.Username, string(hash),
	).Scan(&userID)
	if err != nil {
		jsonErr(w, "username already taken", http.StatusConflict)
		return
	}

	if err := h.issueSession(w, userID); err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"username": req.Username})
}

// Login validates credentials and returns a session cookie.
// POST /api/auth/login
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req credReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, "invalid request body", http.StatusBadRequest)
		return
	}

	var userID int64
	var storedHash string
	err := h.db.QueryRow(
		`SELECT id, password_hash FROM users WHERE username = ?`,
		req.Username,
	).Scan(&userID, &storedHash)

	if err == sql.ErrNoRows {
		// Run bcrypt anyway to prevent timing-based username enumeration.
		bcrypt.CompareHashAndPassword(dummyHash, []byte(req.Password))
		jsonErr(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password)); err != nil {
		jsonErr(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := h.issueSession(w, userID); err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"username": req.Username})
}

// Logout invalidates the current session.
// POST /api/auth/logout
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("cs_session"); err == nil {
		h.db.Exec(`DELETE FROM sessions WHERE token = ?`, cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "cs_session",
		Value:    "",
		MaxAge:   -1,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	jsonOK(w, map[string]any{"ok": true})
}

// Me returns the currently authenticated user's info.
// GET /api/auth/me
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int64)
	var username string
	if err := h.db.QueryRow(`SELECT username FROM users WHERE id = ?`, userID).Scan(&username); err != nil {
		jsonErr(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"username": username, "user_id": userID})
}

// issueSession creates a session row and sets the cookie.
func (h *Handler) issueSession(w http.ResponseWriter, userID int64) error {
	token, err := randomHex(32)
	if err != nil {
		return err
	}
	expires := time.Now().Add(30 * 24 * time.Hour)
	_, err = h.db.Exec(
		`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
		token, userID, expires,
	)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "cs_session",
		Value:    token,
		Expires:  expires,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		// Secure: true, // uncomment when serving over HTTPS
	})
	return nil
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
