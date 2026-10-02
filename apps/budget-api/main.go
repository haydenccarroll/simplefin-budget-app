package main

import (
	"context"
	"log/slog"
	"os"
	_ "time/tzdata" // so timezone names resolve even in a minimal image

	"github.com/urfave/cli/v3"

	"budget-app/apps/budget-api/cmd/serve"
	"budget-app/apps/budget-api/cmd/worker"
)

// @title			budget-api
// @version		1.0.0
// @description	API for SimpleFIN Budget App
// @contact.name	Hayden Carroll
// @schemes		https
func main() {
	cmd := &cli.Command{
		Name: "budget-api",
		Commands: []*cli.Command{
			serve.NewCommand(),
			worker.NewCommand(),
		},
	}

	if err := cmd.Run(context.Background(), os.Args); err != nil {
		slog.Error("command exiting: ", slog.String("err", err.Error()))
	}
}
