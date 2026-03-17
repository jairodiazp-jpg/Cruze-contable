package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Addr            string
	DatabaseURL     string
	WorkerCount     int
	PollInterval    time.Duration
	MaxTasksPerPoll int
	AllowedOrigin   string
}

func Load() (Config, error) {
	cfg := Config{
		Addr:            getEnv("AGENT_RUNTIME_ADDR", ":8090"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		WorkerCount:     getEnvInt("WORKER_COUNT", 6),
		PollInterval:    time.Duration(getEnvInt("POLL_INTERVAL_SECONDS", 2)) * time.Second,
		MaxTasksPerPoll: getEnvInt("MAX_TASKS_PER_CYCLE", 50),
		AllowedOrigin:   getEnv("APP_ALLOWED_ORIGIN", "*"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.WorkerCount < 1 {
		cfg.WorkerCount = 1
	}
	if cfg.MaxTasksPerPoll < 1 {
		cfg.MaxTasksPerPoll = 10
	}
	return cfg, nil
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
