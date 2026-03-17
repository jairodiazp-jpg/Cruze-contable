package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"intelisupp/agents/go-runtime/internal/config"
	"intelisupp/agents/go-runtime/internal/db"
	"intelisupp/agents/go-runtime/internal/orchestrator"
	"intelisupp/agents/go-runtime/internal/repository"
	"intelisupp/agents/go-runtime/internal/server"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db error: %v", err)
	}
	defer pool.Close()

	repo := repository.New(pool)
	orch := orchestrator.New(cfg, repo)
	srv := server.New(cfg, orch)

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("agent runtime listening on %s", cfg.Addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http server error: %v", err)
		}
	}()

	go func() {
		defaultCompanyID := os.Getenv("DEFAULT_COMPANY_ID")
		if defaultCompanyID == "" {
			log.Printf("DEFAULT_COMPANY_ID is empty, background orchestrator disabled")
			return
		}
		triggeredBy := os.Getenv("ORCHESTRATOR_TRIGGERED_BY")
		orch.RunContinuous(ctx, defaultCompanyID, triggeredBy)
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
