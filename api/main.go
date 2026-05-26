package main

import (
	"log"
	"net/http"
	"os"

	"ajayraj.co/api/db"
	"ajayraj.co/api/handlers"
	"ajayraj.co/api/middleware"
)

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data.db"
	}

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer database.Close()

	h := handlers.New(database)
	mux := http.NewServeMux()

	// Auth — no session required
	mux.HandleFunc("POST /api/auth/register", h.Register)
	mux.HandleFunc("POST /api/auth/login", h.Login)

	// Auth — session required
	mux.HandleFunc("POST /api/auth/logout", middleware.RequireAuth(database, h.Logout))
	mux.HandleFunc("GET /api/auth/me", middleware.RequireAuth(database, h.Me))

	// Anki — all require a valid session
	mux.HandleFunc("GET /api/anki/session",  middleware.RequireAuth(database, h.GetSession))
	mux.HandleFunc("POST /api/anki/review",  middleware.RequireAuth(database, h.SubmitReview))
	mux.HandleFunc("GET /api/anki/progress", middleware.RequireAuth(database, h.GetProgress))
	mux.HandleFunc("GET /api/anki/mastery",  middleware.RequireAuth(database, h.GetMastery))
	mux.HandleFunc("GET /api/anki/history",  middleware.RequireAuth(database, h.GetCardHistory))

	// Clip — password-keyed cross-device clipboard (key is SHA-256 hash, computed client-side)
	mux.HandleFunc("POST /api/clip",        h.ClipCreate)
	mux.HandleFunc("GET /api/clip",         h.ClipList)
	mux.HandleFunc("DELETE /api/clip/{id}", h.ClipDelete) // key= query param acts as auth

	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}

	log.Printf("cs-anki API listening on :%s  (db: %s)", port, dbPath)
	log.Fatal(http.ListenAndServe(":"+port, cors(mux)))
}

// cors adds permissive CORS headers for the cs-anki frontend origin.
// In production this should be locked to the exact domain.
func cors(next http.Handler) http.Handler {
	allowed := map[string]bool{
		"http://localhost:4321":        true, // astro dev (main site)
		"http://localhost:5173":        true, // vite dev (cs-anki)
		"http://localhost:5174":        true, // vite dev (clip)
		"https://ajayraj.co":          true, // production (clip is now /clip on main domain)
		"https://cs-anki.ajayraj.co":  true, // production
		"https://clip.ajayraj.co":     true, // kept for any future subdomain use
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
