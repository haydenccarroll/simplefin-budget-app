package budget

import "database/sql"

// Attribution says where a shared-budget row came from. It is embedded in
// responses, so its fields appear inline in the JSON.
type Attribution struct {
	// CreatedBy is the first name of the user who added a hand-entered row.
	CreatedBy *string `json:"created_by"`
	// FromSync is true for rows imported from the bank; SourceAccount is the
	// name of the bank account they came from (null if unknown).
	FromSync      bool    `json:"from_sync"`
	SourceAccount *string `json:"source_account"`
}

// attribution builds an Attribution. Rows imported from the bank carry an
// external_id and have no human creator.
func attribution(createdByName, externalID, sourceAccount sql.NullString) Attribution {
	if externalID.Valid {
		a := Attribution{FromSync: true}
		if sourceAccount.Valid {
			a.SourceAccount = &sourceAccount.String
		}
		return a
	}
	if createdByName.Valid {
		return Attribution{CreatedBy: &createdByName.String}
	}
	return Attribution{}
}

type IncomeItemResponse struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	PlannedAmount float64 `json:"planned_amount"`
	ReceivedAt    *string `json:"received_at"` // null when no date was given
	SortOrder     int32   `json:"sort_order"`
	Attribution
}

type CategoryGroupResponse struct {
	ID              int64   `json:"id"`
	Name            string  `json:"name"`
	SortOrder       int32   `json:"sort_order"`
	PlannedAmount   float64 `json:"planned_amount"`
	SpentAmount     float64 `json:"spent_amount"`
	RemainingAmount float64 `json:"remaining_amount"`
	// Description says what belongs in the category (read by the LLM that
	// categorizes expenses); null if none.
	Description *string `json:"description"`
}

type BudgetTotals struct {
	PlannedIncome float64 `json:"planned_income"`
	Budgeted      float64 `json:"budgeted"`
	LeftToBudget  float64 `json:"left_to_budget"`
	Spent         float64 `json:"spent"`
	Remaining     float64 `json:"remaining"`
}

type BudgetMonthResponse struct {
	ID             int64                   `json:"id"`
	Month          string                  `json:"month"`
	IncomeItems    []IncomeItemResponse    `json:"income_items"`
	CategoryGroups []CategoryGroupResponse `json:"category_groups"`
	Totals         BudgetTotals            `json:"totals"`
}

type BudgetMonthSummary struct {
	ID    int64  `json:"id"`
	Month string `json:"month"`
}

type ExpenseResponse struct {
	ID              int64   `json:"id"`
	CategoryGroupID *int64  `json:"category_group_id"`
	Description     string  `json:"description"`
	Amount          float64 `json:"amount"`
	TransactedAt    *string `json:"transacted_at"` // null when no date was given
	Note            *string `json:"note"`
	// CategoryName is the name of the assigned category group; null if
	// uncategorized.
	CategoryName *string `json:"category_name"`
	// AutoCategorized is true when the category was assigned automatically
	// and not yet confirmed or changed by a person.
	AutoCategorized bool `json:"auto_categorized"`
	Attribution
}
