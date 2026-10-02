package classifier

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// uncategorized is the model's way of declining to pick a category.
const uncategorized = "Uncategorized"

const systemPrompt = "You sort personal bank transactions into the user's budget categories. " +
	"Descriptions are raw bank strings: they may contain store names, cities, processor prefixes " +
	"(SQ *, TST*, SP ) or truncated names. Choose the single best category from the list. " +
	"Some categories have a description of what belongs in them; follow it. " +
	"Each transaction also names the account it occurred on, which can hint at the category " +
	"(e.g. a card that belongs to one person may point at their personal category). " +
	"If no category clearly fits, answer \"Uncategorized\". Never invent a category. " +
	"Err on the side of answering \"Uncategorized\" if you are not confident in an answer."

// Ollama classifies transactions with a model served by Ollama's chat API.
// The reply is constrained to a JSON schema whose category is an enum of the
// user's category names (plus "Uncategorized"), so it can only be one of them.
type Ollama struct {
	URL        string
	Model      string
	HTTPClient *http.Client
}

func NewOllama(url, model string, timeout time.Duration) *Ollama {
	return &Ollama{
		URL:        strings.TrimRight(url, "/"),
		Model:      model,
		HTTPClient: &http.Client{Timeout: timeout},
	}
}

type chatRequest struct {
	Model    string         `json:"model"`
	Stream   bool           `json:"stream"`
	Format   any            `json:"format"`
	Options  map[string]any `json:"options"`
	Messages []chatMessage  `json:"messages"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Message chatMessage `json:"message"`
	Error   string      `json:"error"`
}

// turns a list of categories and a transaction into a prompt to send to
// an LLM for classification
func userPrompt(categories []Category, t Transaction) string {
	var b strings.Builder
	b.WriteString("Categories:\n")
	for _, c := range categories {
		b.WriteString("- " + c.Name)
		if c.Description != "" {
			b.WriteString(": " + c.Description)
		}
		b.WriteString("\n")
	}
	fmt.Fprintf(&b, "\nTransaction:\n  description: %s\n  amount: $%.2f (money spent)\n  account: %s\n\nWhich category?",
		t.Description, t.Amount, t.Account)
	return b.String()
}

func (o *Ollama) options() map[string]any {
	return map[string]any{"temperature": 0, "num_predict": 40}
}

// Classify implements Classifier.
func (o *Ollama) Classify(ctx context.Context, categories []Category, t Transaction) (string, error) {
	if len(categories) == 0 {
		return "", nil
	}

	names := make([]string, len(categories))
	for i, c := range categories {
		names[i] = c.Name
	}

	body, err := json.Marshal(chatRequest{
		Model:  o.Model,
		Stream: false,
		Format: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"category": map[string]any{"type": "string", "enum": append(append([]string{}, names...), uncategorized)},
			},
			"required": []string{"category"},
		},
		Options: o.options(),
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt(categories, t)},
		},
	})
	if err != nil {
		return "", fmt.Errorf("encode request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.URL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := o.HTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call ollama: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read ollama response: %w", err)
	}
	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("parse ollama response (status %d): %w", resp.StatusCode, err)
	}
	if resp.StatusCode != http.StatusOK || out.Error != "" {
		return "", fmt.Errorf("ollama returned %d: %s", resp.StatusCode, out.Error)
	}

	var answer struct {
		Category string `json:"category"`
	}
	if err := json.Unmarshal([]byte(out.Message.Content), &answer); err != nil {
		return "", fmt.Errorf("parse model answer %q: %w", out.Message.Content, err)
	}

	// only return with the category if it is valid
	for _, name := range names {
		if name == answer.Category {
			return name, nil
		}
	}
	return "", nil
}
