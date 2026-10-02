// Package logging builds the structured logger every subcommand uses.
package logging

import (
	"log/slog"
	"os"
	"strings"
)

// NewLogger returns a JSON logger on stdout at the given level: DEBUG, INFO,
// WARN or ERROR (any case). Anything else, including an empty string, gives INFO.
func NewLogger(level string) *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: parseLevel(level)}))
}

func parseLevel(level string) slog.Level {
	switch strings.ToUpper(strings.TrimSpace(level)) {
	case "DEBUG":
		return slog.LevelDebug
	case "WARN":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
