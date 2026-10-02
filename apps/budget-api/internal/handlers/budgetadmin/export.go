package budgetadmin

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"time"

	"budget-app/apps/budget-api/internal/membership"
)

// The export is one flat CSV covering every month that has any records. Each
// row has a type, so it filters and pivots in a spreadsheet:
//
//	summary   a month's totals (name says which; amount is the value)
//	income    an income item (amount is what was planned/received)
//	category  a category (planned_amount is the plan, amount is spent so far)
//	expense   an expense (amount, date, category, note...)
var exportHeader = []string{"month", "type", "name", "category", "date", "amount", "planned_amount", "note", "source", "added_by"}

const uncategorized = "Uncategorized"

type exportIncome struct {
	Name, Date, Amount, Source, AddedBy string
}

type exportCategory struct {
	Name, Planned, Spent string
}

type exportExpense struct {
	Description, Category, Date, Amount, Note, Source, AddedBy string
}

type exportMonth struct {
	Month      string // "2026-09"
	Income     []exportIncome
	Categories []exportCategory
	Expenses   []exportExpense
}

func (m exportMonth) empty() bool {
	return len(m.Income) == 0 && len(m.Categories) == 0 && len(m.Expenses) == 0
}

// toCents parses a decimal string into whole cents so totals add up exactly.
func toCents(s string) int64 {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return int64(math.Round(f * 100))
}

func fromCents(c int64) string {
	sign := ""
	if c < 0 {
		sign = "-"
		c = -c
	}
	return fmt.Sprintf("%s%d.%02d", sign, c/100, c%100)
}

// safeText stops a spreadsheet from running a cell as a formula. Descriptions
// come from banks and from other people, and one that starts with = + - or @
// would otherwise be executed when the file is opened.
func safeText(s string) string {
	if s != "" && (s[0] == '=' || s[0] == '+' || s[0] == '-' || s[0] == '@' || s[0] == '\t' || s[0] == '\r') {
		return "'" + s
	}
	return s
}

// exportRows turns the months into CSV rows, header first. Months with no
// records are left out.
func exportRows(months []exportMonth) [][]string {
	rows := [][]string{exportHeader}
	for _, m := range months {
		if m.empty() {
			continue
		}

		var plannedIncome, budgeted, spent int64
		for _, i := range m.Income {
			plannedIncome += toCents(i.Amount)
		}
		for _, c := range m.Categories {
			budgeted += toCents(c.Planned)
		}
		for _, e := range m.Expenses {
			spent += toCents(e.Amount)
		}
		rows = append(rows,
			[]string{m.Month, "summary", "Planned income", "", "", fromCents(plannedIncome), "", "", "", ""},
			[]string{m.Month, "summary", "Budgeted", "", "", fromCents(budgeted), "", "", "", ""},
			[]string{m.Month, "summary", "Left to budget", "", "", fromCents(plannedIncome - budgeted), "", "", "", ""},
			[]string{m.Month, "summary", "Spent", "", "", fromCents(spent), "", "", "", ""},
		)

		for _, i := range m.Income {
			rows = append(rows, []string{m.Month, "income", safeText(i.Name), "", i.Date, i.Amount, "", "", safeText(i.Source), safeText(i.AddedBy)})
		}
		for _, c := range m.Categories {
			rows = append(rows, []string{m.Month, "category", safeText(c.Name), "", "", c.Spent, c.Planned, "", "", ""})
		}
		for _, e := range m.Expenses {
			category := e.Category
			if category == "" {
				category = uncategorized
			}
			rows = append(rows, []string{m.Month, "expense", safeText(e.Description), safeText(category), e.Date, e.Amount, "", safeText(e.Note), safeText(e.Source), safeText(e.AddedBy)})
		}
	}
	return rows
}

// writeCSV writes the export, preceded by a byte-order mark so Excel reads
// accented characters and emoji correctly.
func writeCSV(w io.Writer, months []exportMonth) error {
	if _, err := io.WriteString(w, "\ufeff"); err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	if err := cw.WriteAll(exportRows(months)); err != nil {
		return err
	}
	return cw.Error()
}

// decimalString reads the driver value of a COALESCE(SUM(...), 0) aggregate
// (sqlc types those columns as any).
func decimalString(v any) string {
	switch t := v.(type) {
	case []byte:
		return string(t)
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', 2, 64)
	case int64:
		return strconv.FormatInt(t, 10)
	default:
		return "0"
	}
}

func (h *Handler) loadExport(ctx context.Context, budgetID int32) ([]exportMonth, error) {
	monthRows, err := h.queries.ListBudgetMonths(ctx, budgetID)
	if err != nil {
		return nil, fmt.Errorf("list months: %w", err)
	}

	// Oldest month first.
	months := make([]exportMonth, 0, len(monthRows))
	for i := len(monthRows) - 1; i >= 0; i-- {
		row := monthRows[i]
		m := exportMonth{Month: row.Month.Format("2006-01")}

		income, err := h.queries.ListIncomeItemsByMonth(ctx, row.ID)
		if err != nil {
			return nil, fmt.Errorf("list income for %s: %w", m.Month, err)
		}
		for _, ii := range income {
			m.Income = append(m.Income, exportIncome{
				Name:    ii.Name,
				Date:    dateString(ii.ReceivedAt.Time, ii.ReceivedAt.Valid),
				Amount:  ii.PlannedAmount,
				Source:  ii.SourceAccountName.String,
				AddedBy: addedBy(ii.CreatedByName.String, ii.CreatedByName.Valid, ii.ExternalID.Valid),
			})
		}

		groups, err := h.queries.ListCategoryGroupsByMonth(ctx, row.ID)
		if err != nil {
			return nil, fmt.Errorf("list categories for %s: %w", m.Month, err)
		}
		spentRows, err := h.queries.SumSpentByCategoryGroupForMonth(ctx, row.ID)
		if err != nil {
			return nil, fmt.Errorf("sum spending for %s: %w", m.Month, err)
		}
		spentByGroup := make(map[int32]string, len(spentRows))
		for _, s := range spentRows {
			if s.CategoryGroupID.Valid {
				spentByGroup[s.CategoryGroupID.Int32] = decimalString(s.Spent)
			}
		}
		for _, g := range groups {
			spent := spentByGroup[g.ID]
			if spent == "" {
				spent = "0.00"
			}
			m.Categories = append(m.Categories, exportCategory{Name: g.Name, Planned: g.PlannedAmount, Spent: fromCents(toCents(spent))})
		}

		expenses, err := h.queries.ListAllExpensesByMonth(ctx, row.ID)
		if err != nil {
			return nil, fmt.Errorf("list expenses for %s: %w", m.Month, err)
		}
		for _, e := range expenses {
			m.Expenses = append(m.Expenses, exportExpense{
				Description: e.Description,
				Category:    e.CategoryName.String,
				Date:        dateString(e.TransactedAt.Time, e.TransactedAt.Valid),
				Amount:      e.Amount,
				Note:        e.Note.String,
				Source:      e.SourceAccountName.String,
				AddedBy:     addedBy(e.CreatedByName.String, e.CreatedByName.Valid, e.ExternalID.Valid),
			})
		}
		months = append(months, m)
	}
	return months, nil
}

func dateString(t time.Time, valid bool) string {
	if !valid {
		return ""
	}
	return t.Format("2006-01-02")
}

// addedBy names who a row came from: the person who entered it, or "Bank sync"
// for imported ones (which have no person).
func addedBy(name string, hasName, imported bool) string {
	switch {
	case hasName:
		return name
	case imported:
		return "Bank sync"
	default:
		return ""
	}
}

// ExportCSV downloads everything in the budget as one CSV: every month that has
// records, with its totals, income, categories and expenses. Any member can.
//
// @Summary      Export the whole budget as CSV
// @Tags         budget-admin
// @Produce      text/csv
// @Success      200 {file} file
// @Router       /v1/budget/export [get]
func (h *Handler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	ctx := r.Context()

	months, err := h.loadExport(ctx, access.BudgetID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to load budget export", "error", err, "budget_id", access.BudgetID)
		writeError(w, http.StatusInternalServerError, "failed to export the budget")
		return
	}
	// Built in memory first so a failure can still be reported as one.
	var body bytes.Buffer
	if err := writeCSV(&body, months); err != nil {
		h.logger.ErrorContext(ctx, "failed to write budget export", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to export the budget")
		return
	}

	filename := fmt.Sprintf("bill-and-dills-budget-%s.csv", time.Now().UTC().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	_, _ = w.Write(body.Bytes())
}
