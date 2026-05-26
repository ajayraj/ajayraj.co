package handlers

import "ajayraj.co/api/db"

// Handler holds shared dependencies for all route handlers.
type Handler struct {
	db *db.DB
}

// New creates a Handler backed by the given database.
func New(d *db.DB) *Handler {
	return &Handler{db: d}
}
