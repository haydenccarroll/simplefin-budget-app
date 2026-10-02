package classifier

import "context"

// Transaction is what the model is shown about an expense.
type Transaction struct {
	Description string
	// Amount is money spent (positive).
	Amount float64
	// Account is the name of the account the transaction occurred on. May potentially help the model in
	// determining what category it should go into (if it was triggered on Bob's Credit card, may go)
	// into Bob's Personal Category
	Account string
}

type Category struct {
	Name string
	// Description says what belongs in the category; may be empty. Really only provided to help
	// inform the model to make more accurate decisions
	Description string
}

// Classifier picks one of the given categories for a transaction.
type Classifier interface {
	// Classify returns the chosen category's name, or "" if none clearly
	// fits. It never returns a name that isn't in categories.
	Classify(ctx context.Context, categories []Category, t Transaction) (string, error)
}
