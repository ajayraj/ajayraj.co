package handlers

import (
	"crypto/rand"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

const (
	clipIDAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789"
	clipIDLen      = 7
	clipMaxBytes   = 512 * 1024 // 512 KB
	clipKeyLen     = 64         // SHA-256 hex = 64 chars
)

// newClipID returns a random 7-character base62 string (no ambiguous chars).
func newClipID() string {
	b := make([]byte, clipIDLen)
	rand.Read(b)
	for i, v := range b {
		b[i] = clipIDAlphabet[int(v)%len(clipIDAlphabet)]
	}
	return string(b)
}

type clipCreateReq struct {
	Key     string `json:"key"`     // SHA-256 hex of "clip:"+keyword, computed client-side
	Content string `json:"content"`
	Burn    bool   `json:"burn"`
}

type clipItem struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	Burn      bool   `json:"burn"`
	CreatedAt string `json:"created_at"`
}

// ClipCreate stores a new clip keyed by a client-computed password hash.
// POST /api/clip  { key, content, burn }
func (h *Handler) ClipCreate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, clipMaxBytes+4096)

	var req clipCreateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	req.Key = strings.TrimSpace(req.Key)
	if len(req.Key) != clipKeyLen {
		jsonErr(w, "key must be a 64-character hex SHA-256 hash", http.StatusBadRequest)
		return
	}

	req.Content = strings.TrimRight(req.Content, "\n")
	if req.Content == "" {
		jsonErr(w, "content is required", http.StatusBadRequest)
		return
	}
	if len(req.Content) > clipMaxBytes {
		jsonErr(w, "content too large (max 512 KB)", http.StatusRequestEntityTooLarge)
		return
	}

	// Generate unique ID (collisions are astronomically rare but we retry)
	id := newClipID()
	for i := 0; i < 4; i++ {
		var n int
		h.db.QueryRow(`SELECT COUNT(1) FROM clips WHERE id = ?`, id).Scan(&n)
		if n == 0 {
			break
		}
		id = newClipID()
	}

	burn := 0
	if req.Burn {
		burn = 1
	}
	now := time.Now().UTC().Format(time.RFC3339)

	_, err := h.db.Exec(`
		INSERT INTO clips (id, content, burn, password_hash, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, id, req.Content, burn, req.Key, now)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(clipItem{
		ID:        id,
		Content:   req.Content,
		Burn:      req.Burn,
		CreatedAt: now,
	})
}

// ClipList returns all active (unexpired) clips for the given key.
// GET /api/clip?key=<sha256-hex>
func (h *Handler) ClipList(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if len(key) != clipKeyLen {
		jsonErr(w, "key must be a 64-character hex SHA-256 hash", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Query(`
		SELECT id, content, burn, created_at
		FROM   clips
		WHERE  password_hash = ?
		  AND  (expires_at IS NULL OR expires_at > datetime('now'))
		ORDER  BY created_at DESC
	`, key)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := []clipItem{} // initialised so JSON encodes as [] not null
	for rows.Next() {
		var item clipItem
		var burn int
		if err := rows.Scan(&item.ID, &item.Content, &burn, &item.CreatedAt); err != nil {
			continue
		}
		item.Burn = burn == 1
		items = append(items, item)
	}

	jsonOK(w, items)
}

// ClipDelete removes a clip by ID, verifying that the supplied key matches.
// The key acts as proof of ownership — no session auth required.
// DELETE /api/clip/{id}?key=<sha256-hex>
func (h *Handler) ClipDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonErr(w, "missing id", http.StatusBadRequest)
		return
	}

	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if len(key) != clipKeyLen {
		jsonErr(w, "key must be a 64-character hex SHA-256 hash", http.StatusBadRequest)
		return
	}

	res, err := h.db.Exec(`DELETE FROM clips WHERE id = ? AND password_hash = ?`, id, key)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		jsonErr(w, "clip not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}
