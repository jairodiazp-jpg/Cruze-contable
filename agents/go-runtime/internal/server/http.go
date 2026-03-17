package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"intelisupp/agents/go-runtime/internal/config"
	"intelisupp/agents/go-runtime/internal/orchestrator"
)

type Server struct {
	cfg          config.Config
	orchestrator *orchestrator.Orchestrator
}

func New(cfg config.Config, orchestrator *orchestrator.Orchestrator) *Server {
	return &Server{cfg: cfg, orchestrator: orchestrator}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/v1/workflows/start", s.handleStartWorkflow)
	mux.HandleFunc("/v1/orchestrator/run", s.handleRunCycle)
	return s.withCORS(mux)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

type startWorkflowRequest struct {
	CompanyID string         `json:"company_id"`
	Goal      string         `json:"goal"`
	CreatedBy string         `json:"created_by"`
	Payload   map[string]any `json:"payload"`
}

func (s *Server) handleStartWorkflow(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}

	var req startWorkflowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}

	workflowID, err := s.orchestrator.StartWorkflow(r.Context(), req.CompanyID, req.Goal, req.CreatedBy, req.Payload)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusAccepted, map[string]any{
		"workflow_id": workflowID,
		"status":      "pending",
	})
}

type runCycleRequest struct {
	CompanyID   string `json:"company_id"`
	TriggeredBy string `json:"triggered_by"`
}

func (s *Server) handleRunCycle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}

	var req runCycleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}
	if req.CompanyID == "" {
		respondJSON(w, http.StatusBadRequest, map[string]any{"error": "company_id is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := s.orchestrator.RunCycle(ctx, req.CompanyID, req.TriggeredBy); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", s.cfg.AllowedOrigin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func respondJSON(w http.ResponseWriter, status int, payload map[string]any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
