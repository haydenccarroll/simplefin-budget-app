package budget

import (
	"context"
	"time"
)

// buildBudgetMonthResponse assembles the full nested budget view for a month:
// income items, category groups (spent amounts derived from expenses), and
// month-level totals including left-to-budget.
func (h *Handler) buildBudgetMonthResponse(ctx context.Context, budgetMonthID int32, month time.Time) (*BudgetMonthResponse, error) {
	incomeRows, err := h.queries.ListIncomeItemsByMonth(ctx, budgetMonthID)
	if err != nil {
		return nil, err
	}
	groupRows, err := h.queries.ListCategoryGroupsByMonth(ctx, budgetMonthID)
	if err != nil {
		return nil, err
	}
	spentRows, err := h.queries.SumSpentByCategoryGroupForMonth(ctx, budgetMonthID)
	if err != nil {
		return nil, err
	}
	totalSpentRaw, err := h.queries.SumSpentForMonth(ctx, budgetMonthID)
	if err != nil {
		return nil, err
	}

	spentByCategoryGroup := make(map[int32]float64, len(spentRows))
	for _, s := range spentRows {
		if s.CategoryGroupID.Valid {
			spentByCategoryGroup[s.CategoryGroupID.Int32] = decimalFromInterface(s.Spent)
		}
	}
	totalSpent := decimalFromInterface(totalSpentRaw)

	incomeItems := make([]IncomeItemResponse, len(incomeRows))
	var plannedIncome float64
	for i, ii := range incomeRows {
		planned, _ := parseAmount(ii.PlannedAmount)
		attr := attribution(ii.CreatedByName, ii.ExternalID, ii.SourceAccountName)
		incomeItems[i] = IncomeItemResponse{
			ID:            int64(ii.ID),
			Name:          ii.Name,
			PlannedAmount: planned,
			ReceivedAt:    formatOptionalDate(ii.ReceivedAt),
			SortOrder:     ii.SortOrder,
			Attribution:   attr,
		}
		plannedIncome += planned
	}

	var budgeted float64
	categoryGroups := make([]CategoryGroupResponse, len(groupRows))
	for i, g := range groupRows {
		planned, _ := parseAmount(g.PlannedAmount)
		spent := spentByCategoryGroup[g.ID]
		categoryGroups[i] = CategoryGroupResponse{
			ID:              int64(g.ID),
			Name:            g.Name,
			SortOrder:       g.SortOrder,
			PlannedAmount:   planned,
			SpentAmount:     spent,
			RemainingAmount: roundCents(planned - spent),
			Description:     descriptionPtr(g.Description),
		}
		budgeted += planned
	}

	totals := BudgetTotals{
		PlannedIncome: roundCents(plannedIncome),
		Budgeted:      roundCents(budgeted),
		LeftToBudget:  roundCents(plannedIncome - budgeted),
		Spent:         totalSpent,
		Remaining:     roundCents(budgeted - totalSpent),
	}

	return &BudgetMonthResponse{
		ID:             int64(budgetMonthID),
		Month:          formatMonth(month),
		IncomeItems:    incomeItems,
		CategoryGroups: categoryGroups,
		Totals:         totals,
	}, nil
}
