package classifier

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var testCategories = []Category{
	{Name: "Groceries"},
	{Name: "Eating Out", Description: "restaurants, coffee shops, fast food, delivery"},
	{Name: "Personal (Bob)"},
}

func newTestOllama(t *testing.T, handler http.HandlerFunc) *Ollama {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return NewOllama(srv.URL+"/", "test-model", 5*time.Second)
}

func reply(w http.ResponseWriter, content string) {
	_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"role": "assistant", "content": content}})
}

func TestClassifyRequestAndAnswer(t *testing.T) {
	var got chatRequest
	o := newTestOllama(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		reply(w, `{"category":"Groceries"}`)
	})

	category, err := o.Classify(context.Background(), testCategories, Transaction{Description: "SMITHS MRKTPL", Amount: 15, Account: "Bob's credit card"})
	if err != nil {
		t.Fatal(err)
	}
	if category != "Groceries" {
		t.Errorf("category = %q", category)
	}
	if got.Model != "test-model" || got.Stream {
		t.Errorf("model/stream = %q/%v", got.Model, got.Stream)
	}
	if got.Options["temperature"] != float64(0) {
		t.Errorf("temperature = %v, want 0", got.Options["temperature"])
	}

	// The schema must restrict the answer to the user's categories plus None.
	schema, _ := json.Marshal(got.Format)
	for _, want := range []string{`"Groceries"`, `"Eating Out"`, `"Personal (Bob)"`, `"Uncategorized"`, `"enum"`} {
		if !strings.Contains(string(schema), want) {
			t.Errorf("schema %s missing %s", schema, want)
		}
	}
	if system := got.Messages[0].Content; !strings.Contains(system, "description") || !strings.Contains(system, "account") {
		t.Errorf("system prompt should explain category descriptions and account names:\n%s", system)
	}
	prompt := got.Messages[1].Content
	// A category with a description is shown with it; one without is just its name.
	for _, want := range []string{"- Groceries\n", "- Eating Out: restaurants, coffee shops, fast food, delivery\n", "SMITHS MRKTPL", "$15.00", "account: Bob's credit card"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt missing %q:\n%s", want, prompt)
		}
	}
}
