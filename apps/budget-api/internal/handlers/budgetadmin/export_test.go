package budgetadmin

import (
	"bytes"
	"encoding/csv"
	"strings"
	"testing"
)

func sampleMonths() []exportMonth {
	return []exportMonth{
		{Month: "2026-08"}, // nothing recorded: left out
		{
			Month:  "2026-09",
			Income: []exportIncome{{Name: "Paycheck", Date: "2026-09-01", Amount: "1000.00", AddedBy: "Sam"}},
			Categories: []exportCategory{
				{Name: "Food", Planned: "600.00", Spent: "25.50"},
				{Name: "Fun", Planned: "300.00", Spent: "0.00"},
			},
			Expenses: []exportExpense{
				{Description: "Groceries", Category: "Food", Date: "2026-09-03", Amount: "25.50", Note: "for the party", AddedBy: "Ann"},
				{Description: "Mystery", Amount: "4.00", Source: "Checking", AddedBy: "Bank sync"},
			},
		},
	}
}

func TestExportRows(t *testing.T) {
	rows := exportRows(sampleMonths())

	if strings.Join(rows[0], ",") != strings.Join(exportHeader, ",") {
		t.Fatalf("first row should be the header, got %v", rows[0])
	}
	for _, r := range rows {
		if len(r) != len(exportHeader) {
			t.Fatalf("row %v has %d columns, want %d", r, len(r), len(exportHeader))
		}
		if r[0] == "2026-08" {
			t.Fatalf("a month with no records should be left out, got %v", r)
		}
	}

	byType := map[string]int{}
	for _, r := range rows[1:] {
		byType[r[1]]++
	}
	if byType["summary"] != 4 || byType["income"] != 1 || byType["category"] != 2 || byType["expense"] != 2 {
		t.Fatalf("unexpected row counts by type: %v", byType)
	}

	find := func(typ, name string) []string {
		for _, r := range rows {
			if r[1] == typ && r[2] == name {
				return r
			}
		}
		t.Fatalf("no %s row named %q", typ, name)
		return nil
	}
	if got := find("summary", "Planned income")[5]; got != "1000.00" {
		t.Errorf("planned income = %s", got)
	}
	if got := find("summary", "Budgeted")[5]; got != "900.00" {
		t.Errorf("budgeted = %s", got)
	}
	if got := find("summary", "Left to budget")[5]; got != "100.00" {
		t.Errorf("left to budget = %s", got)
	}
	if got := find("summary", "Spent")[5]; got != "29.50" {
		t.Errorf("spent = %s (all expenses count, categorized or not)", got)
	}
	if got := find("expense", "Mystery")[3]; got != uncategorized {
		t.Errorf("an expense with no category should read %q, got %q", uncategorized, got)
	}
	if got := find("category", "Food"); got[5] != "25.50" || got[6] != "600.00" {
		t.Errorf("category row should have spent in amount and plan in planned_amount, got %v", got)
	}
}

func TestExportNegativeLeftToBudget(t *testing.T) {
	rows := exportRows([]exportMonth{{
		Month:      "2026-09",
		Income:     []exportIncome{{Name: "Pay", Amount: "100.00"}},
		Categories: []exportCategory{{Name: "Rent", Planned: "150.25", Spent: "0.00"}},
	}})
	for _, r := range rows {
		if r[2] == "Left to budget" && r[5] != "-50.25" {
			t.Errorf("left to budget = %s, want -50.25", r[5])
		}
	}
}

func TestSafeTextBlocksFormulas(t *testing.T) {
	for _, in := range []string{"=SUM(A1)", "+1", "-2+3", "@cmd", "\tx", "\rx"} {
		if got := safeText(in); got != "'"+in {
			t.Errorf("safeText(%q) = %q, want it prefixed with a quote", in, got)
		}
	}
	for _, in := range []string{"Groceries", "", "Trader Joe's", "50% off"} {
		if got := safeText(in); got != in {
			t.Errorf("safeText(%q) = %q, want unchanged", in, got)
		}
	}
}

func TestWriteCSVRoundTrips(t *testing.T) {
	months := []exportMonth{{
		Month:    "2026-09",
		Expenses: []exportExpense{{Description: `Comma, "quote"` + "\n" + `and newline`, Category: "Food", Amount: "1.00"}},
	}}
	var buf bytes.Buffer
	if err := writeCSV(&buf, months); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(buf.String(), "\ufeff") {
		t.Error("the file should start with a byte-order mark for Excel")
	}
	parsed, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(buf.String(), "\ufeff"))).ReadAll()
	if err != nil {
		t.Fatalf("the output isn't valid CSV: %v", err)
	}
	last := parsed[len(parsed)-1]
	if last[2] != `Comma, "quote"`+"\n"+`and newline` {
		t.Errorf("a description with commas, quotes and a newline should survive, got %q", last[2])
	}
}

func TestCents(t *testing.T) {
	for in, want := range map[string]int64{"1000.00": 100000, "0.10": 10, "12.345": 1235, "junk": 0} {
		if got := toCents(in); got != want {
			t.Errorf("toCents(%q) = %d, want %d", in, got, want)
		}
	}
	for in, want := range map[int64]string{100000: "1000.00", 5: "0.05", -5025: "-50.25", 0: "0.00"} {
		if got := fromCents(in); got != want {
			t.Errorf("fromCents(%d) = %q, want %q", in, got, want)
		}
	}
}
