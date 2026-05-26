package handlers

import (
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"time"

	"ajayraj.co/api/middleware"
)

const (
	newCardBudget      = 10
	maxReviewsPerSess  = 20
)

// CardProgress mirrors the card_progress table row, serialised for the frontend.
type CardProgress struct {
	CardID       string   `json:"card_id"`
	IntervalDays float64  `json:"interval_days"`
	EaseFactor   float64  `json:"ease_factor"`
	Repetitions  int      `json:"repetitions"`
	NextReview   *string  `json:"next_review"`
	LastReviewed *string  `json:"last_reviewed"`
	LastRating   *string  `json:"last_rating"`
}

// GetSession returns card IDs for today's study session.
// The frontend is the source of truth for the full card catalogue; we only
// manage progress. new_budget tells the frontend how many unseen cards to add.
// GET /api/anki/session
func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int64)
	today := time.Now().Format("2006-01-02")

	rows, err := h.db.Query(`
		SELECT card_id FROM card_progress
		WHERE user_id = ? AND next_review IS NOT NULL AND next_review <= ?
		ORDER BY next_review ASC
		LIMIT ?
	`, userID, today, maxReviewsPerSess)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	reviewCards := []string{}
	for rows.Next() {
		var id string
		rows.Scan(&id)
		reviewCards = append(reviewCards, id)
	}

	// Return the set of all seen card IDs so the frontend can exclude them
	// when picking new cards.
	seenRows, err := h.db.Query(`SELECT card_id FROM card_progress WHERE user_id = ?`, userID)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}
	defer seenRows.Close()

	seenIDs := []string{}
	for seenRows.Next() {
		var id string
		seenRows.Scan(&id)
		seenIDs = append(seenIDs, id)
	}

	// Count cards whose very first review ever was today.
	// These are the "new" cards consumed from today's budget.
	var newDrilledToday int
	h.db.QueryRow(`
		SELECT COUNT(*) FROM (
			SELECT card_id
			FROM card_reviews
			WHERE user_id = ?
			GROUP BY card_id
			HAVING MIN(date(reviewed_at)) = ?
		)
	`, userID, today).Scan(&newDrilledToday)

	jsonOK(w, map[string]any{
		"review_card_ids":  reviewCards,
		"seen_card_ids":    seenIDs,
		"new_budget":       newCardBudget,
		"new_drilled_today": newDrilledToday,
	})
}

type reviewReq struct {
	CardID string `json:"card_id"`
	Rating string `json:"rating"` // "got_it" | "almost" | "no"
	Mode   string `json:"mode"`   // "drill" | "quiz"
}

// SubmitReview records a review and updates SM-2 state for a card.
// POST /api/anki/review
func (h *Handler) SubmitReview(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int64)

	var req reviewReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CardID == "" {
		jsonErr(w, "invalid request", http.StatusBadRequest)
		return
	}
	switch req.Rating {
	case "got_it", "almost", "no":
	default:
		jsonErr(w, "rating must be got_it, almost, or no", http.StatusBadRequest)
		return
	}
	// Default mode to "drill" if not supplied
	if req.Mode == "" {
		req.Mode = "drill"
	}

	// Load existing progress (may not exist for a new card).
	var existing CardProgress
	err := h.db.QueryRow(`
		SELECT card_id, interval_days, ease_factor, repetitions, next_review, last_reviewed, last_rating
		FROM card_progress WHERE user_id = ? AND card_id = ?
	`, userID, req.CardID).Scan(
		&existing.CardID, &existing.IntervalDays, &existing.EaseFactor,
		&existing.Repetitions, &existing.NextReview, &existing.LastReviewed, &existing.LastRating,
	)
	isNew := err == sql.ErrNoRows

	next := computeSM2(existing, req.Rating, isNew)
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = h.db.Exec(`
		INSERT INTO card_progress
			(user_id, card_id, interval_days, ease_factor, repetitions, next_review, last_reviewed, last_rating)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, card_id) DO UPDATE SET
			interval_days = excluded.interval_days,
			ease_factor   = excluded.ease_factor,
			repetitions   = excluded.repetitions,
			next_review   = excluded.next_review,
			last_reviewed = excluded.last_reviewed,
			last_rating   = excluded.last_rating
	`, userID, req.CardID, next.IntervalDays, next.EaseFactor,
		next.Repetitions, next.NextReview, now, req.Rating)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}

	// Log to review history (fire-and-forget style — don't fail the request if this errors)
	h.db.Exec(`INSERT INTO card_reviews (user_id, card_id, rating, mode, reviewed_at) VALUES (?, ?, ?, ?, ?)`,
		userID, req.CardID, req.Rating, req.Mode, now)

	jsonOK(w, next)
}

// GetProgress returns all card progress rows for the authenticated user,
// keyed by card_id for O(1) lookup on the frontend.
// GET /api/anki/progress
func (h *Handler) GetProgress(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int64)

	rows, err := h.db.Query(`
		SELECT card_id, interval_days, ease_factor, repetitions, next_review, last_reviewed, last_rating
		FROM card_progress WHERE user_id = ?
	`, userID)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	progress := map[string]CardProgress{}
	for rows.Next() {
		var p CardProgress
		rows.Scan(&p.CardID, &p.IntervalDays, &p.EaseFactor, &p.Repetitions,
			&p.NextReview, &p.LastReviewed, &p.LastRating)
		progress[p.CardID] = p
	}
	jsonOK(w, progress)
}

// CategoryStats is the per-category mastery summary returned by GetMastery.
type CategoryStats struct {
	Seen      int     `json:"seen"`
	MeanEase  float64 `json:"mean_ease"`
	TotalReps int     `json:"total_reps"`
	// Due is populated from the session query — not stored in the DB.
	Due int `json:"due"`
}

// GetMastery aggregates per-category stats from the user's progress.
// Category is derived from the card ID prefix: "T0-ARR-001" → "ARR".
// GET /api/anki/mastery
func (h *Handler) GetMastery(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int64)
	today := time.Now().Format("2006-01-02")

	rows, err := h.db.Query(`
		SELECT card_id, ease_factor, repetitions, next_review
		FROM card_progress WHERE user_id = ?
	`, userID)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type acc struct {
		seen  int
		ease  float64
		reps  int
		due   int
	}
	cats := map[string]*acc{}

	for rows.Next() {
		var cardID string
		var ease float64
		var reps int
		var nextReview *string
		rows.Scan(&cardID, &ease, &reps, &nextReview)

		cat := categoryFromID(cardID)
		if cats[cat] == nil {
			cats[cat] = &acc{}
		}
		cats[cat].seen++
		cats[cat].ease += ease
		cats[cat].reps += reps
		if nextReview != nil && *nextReview <= today {
			cats[cat].due++
		}
	}

	result := map[string]CategoryStats{}
	for cat, s := range cats {
		mean := 0.0
		if s.seen > 0 {
			mean = s.ease / float64(s.seen)
		}
		result[cat] = CategoryStats{
			Seen:      s.seen,
			MeanEase:  math.Round(mean*100) / 100,
			TotalReps: s.reps,
			Due:       s.due,
		}
	}
	jsonOK(w, result)
}

// CardHistorySummary is the per-card review summary returned by GetCardHistory.
type CardHistorySummary struct {
	Count    int      `json:"count"`
	Modes    []string `json:"modes"`
	LastSeen string   `json:"last_seen"`
}

// GetCardHistory returns a compact per-card review summary for the user.
// Useful for the progress page drill-down: count, modes used, last seen date.
// GET /api/anki/history
func (h *Handler) GetCardHistory(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int64)

	rows, err := h.db.Query(`
		SELECT card_id, mode, MAX(reviewed_at) as last_seen, COUNT(*) as cnt
		FROM card_reviews
		WHERE user_id = ?
		GROUP BY card_id, mode
		ORDER BY card_id, last_seen DESC
	`, userID)
	if err != nil {
		jsonErr(w, "server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type entry struct {
		count    int
		modes    map[string]bool
		lastSeen string
	}
	acc := map[string]*entry{}
	for rows.Next() {
		var cardID, mode, lastSeen string
		var cnt int
		rows.Scan(&cardID, &mode, &lastSeen, &cnt)
		if acc[cardID] == nil {
			acc[cardID] = &entry{modes: map[string]bool{}}
		}
		acc[cardID].count += cnt
		acc[cardID].modes[mode] = true
		if lastSeen > acc[cardID].lastSeen {
			acc[cardID].lastSeen = lastSeen
		}
	}

	result := map[string]CardHistorySummary{}
	for id, e := range acc {
		modes := make([]string, 0, len(e.modes))
		for m := range e.modes {
			modes = append(modes, m)
		}
		result[id] = CardHistorySummary{Count: e.count, Modes: modes, LastSeen: e.lastSeen}
	}
	jsonOK(w, result)
}

// categoryFromID extracts the category code from a card ID.
// "T0-ARR-001" → "ARR", "T2-DP-003" → "DP"
func categoryFromID(id string) string {
	parts := strings.SplitN(id, "-", 3)
	if len(parts) >= 2 {
		return parts[1]
	}
	return "OTHER"
}

// SM-2 ─────────────────────────────────────────────────────────────────────

// sm2Result is returned by SubmitReview and written to the DB.
type sm2Result struct {
	CardID       string  `json:"card_id"`
	IntervalDays float64 `json:"interval_days"`
	EaseFactor   float64 `json:"ease_factor"`
	Repetitions  int     `json:"repetitions"`
	NextReview   string  `json:"next_review"`
}

// computeSM2 calculates the next review state using the SM-2 algorithm.
// Rating → quality mapping:
//   - "got_it" → 5 (perfect recall)
//   - "almost" → 3 (correct with hesitation)
//   - "no"     → 1 (complete failure)
func computeSM2(prev CardProgress, rating string, isNew bool) sm2Result {
	ef := prev.EaseFactor
	if isNew || ef < 1.3 {
		ef = 2.5
	}
	rep := prev.Repetitions
	interval := prev.IntervalDays
	if isNew || interval < 1 {
		interval = 1
	}

	var q int
	switch rating {
	case "got_it":
		q = 5
	case "almost":
		q = 3
	default: // "no"
		q = 1
	}

	if q < 3 {
		// Failed — reset to beginning
		rep = 0
		interval = 1
	} else {
		switch rep {
		case 0:
			interval = 1
		case 1:
			interval = 6
		default:
			interval = math.Round(interval * ef)
		}
		rep++
	}

	// SM-2 ease factor update formula
	ef = ef + (0.1 - float64(5-q)*(0.08+float64(5-q)*0.02))
	if ef < 1.3 {
		ef = 1.3
	}
	ef = math.Round(ef*1000) / 1000

	nextReview := time.Now().Add(time.Duration(interval) * 24 * time.Hour).Format("2006-01-02")

	return sm2Result{
		CardID:       prev.CardID,
		IntervalDays: interval,
		EaseFactor:   ef,
		Repetitions:  rep,
		NextReview:   nextReview,
	}
}
