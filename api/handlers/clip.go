package handlers

import (
	"crypto/rand"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	clipIDAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789"
	clipIDLen      = 7
	clipMaxBytes   = 512 * 1024 // 512 KB
	clipPublicBase = "https://ajayraj.co/clip"
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
	Content   string `json:"content"`
	Title     string `json:"title"`
	Language  string `json:"language"`
	ExpiresIn string `json:"expires_in"` // "1h" | "24h" | "7d" | "30d" | "" = never
	Burn      bool   `json:"burn"`
}

type clipResp struct {
	ID        string  `json:"id"`
	Content   string  `json:"content"`
	Title     string  `json:"title"`
	Language  string  `json:"language"`
	ExpiresAt *string `json:"expires_at"`
	Burn      bool    `json:"burn"`
	ViewCount int     `json:"view_count"`
	CreatedAt string  `json:"created_at"`
	URL       string  `json:"url"`
}

// ClipCreate creates a new clip and returns its ID + public URL.
// POST /api/clip
func (h *Handler) ClipCreate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, clipMaxBytes+4096)

	var req clipCreateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, "invalid JSON", http.StatusBadRequest)
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

	lang := strings.TrimSpace(req.Language)
	if lang == "" {
		lang = "text"
	}
	title := strings.TrimSpace(req.Title)
	if len(title) > 200 {
		title = title[:200]
	}

	// Compute optional expiry timestamp
	var expiresAt *string
	switch req.ExpiresIn {
	case "1h":
		t := time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339)
		expiresAt = &t
	case "24h":
		t := time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339)
		expiresAt = &t
	case "7d":
		t := time.Now().Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339)
		expiresAt = &t
	case "30d":
		t := time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339)
		expiresAt = &t
	}

	// Generate a unique ID (collisions are astronomically unlikely but we retry)
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
		INSERT INTO clips (id, content, language, title, expires_at, burn, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, id, req.Content, lang, title, expiresAt, burn, now)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(clipResp{
		ID:        id,
		Content:   req.Content,
		Title:     title,
		Language:  lang,
		ExpiresAt: expiresAt,
		Burn:      req.Burn,
		ViewCount: 0,
		CreatedAt: now,
		URL:       clipPublicBase + "#" + id,
	})
}

// ClipGet returns a clip by ID. Increments view count. Handles burn-after-read
// and expiry. Responds with plain text when ?raw=1 or Accept: text/plain.
// GET /api/clip/{id}
func (h *Handler) ClipGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" || len(id) > 20 {
		jsonErr(w, "invalid id", http.StatusBadRequest)
		return
	}

	var (
		content, lang, title, createdAt string
		expiresAt                        *string
		burn, viewCount                  int
	)

	err := h.db.QueryRow(`
		SELECT content, language, title, expires_at, burn, view_count, created_at
		FROM clips WHERE id = ?
	`, id).Scan(&content, &lang, &title, &expiresAt, &burn, &viewCount, &createdAt)
	if err != nil {
		jsonErr(w, "clip not found", http.StatusNotFound)
		return
	}

	// Expiry check
	if expiresAt != nil {
		exp, _ := time.Parse(time.RFC3339, *expiresAt)
		if time.Now().After(exp) {
			h.db.Exec(`DELETE FROM clips WHERE id = ?`, id)
			jsonErr(w, "clip has expired", http.StatusGone)
			return
		}
	}

	// Burn-after-read: already viewed → gone
	if burn == 1 && viewCount > 0 {
		h.db.Exec(`DELETE FROM clips WHERE id = ?`, id)
		jsonErr(w, "this clip has been burned", http.StatusGone)
		return
	}

	// Increment view count
	h.db.Exec(`UPDATE clips SET view_count = view_count + 1 WHERE id = ?`, id)
	viewCount++

	// Schedule deletion for burn clips after this response
	if burn == 1 {
		defer h.db.Exec(`DELETE FROM clips WHERE id = ?`, id)
	}

	// Raw mode: ?raw=1 or Accept: text/plain → serve content directly
	wantsRaw := r.URL.Query().Get("raw") == "1" ||
		strings.Contains(r.Header.Get("Accept"), "text/plain")
	if wantsRaw {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		io.WriteString(w, content)
		return
	}

	jsonOK(w, clipResp{
		ID:        id,
		Content:   content,
		Title:     title,
		Language:  lang,
		ExpiresAt: expiresAt,
		Burn:      burn == 1,
		ViewCount: viewCount,
		CreatedAt: createdAt,
		URL:       clipPublicBase + "#" + id,
	})
}

// ClipDelete removes a clip. Requires auth (any logged-in user on this
// personal site can delete any clip — adjust if multi-tenant).
// DELETE /api/clip/{id}
func (h *Handler) ClipDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonErr(w, "missing id", http.StatusBadRequest)
		return
	}
	res, err := h.db.Exec(`DELETE FROM clips WHERE id = ?`, id)
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
