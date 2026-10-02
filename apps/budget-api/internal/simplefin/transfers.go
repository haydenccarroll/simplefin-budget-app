package simplefin

import "regexp"

// transferDescriptions matches descriptions that read as a transfer between
// accounts or a credit card payment, rather than money coming in from or
// going out to the outside world. It is description-only: SimpleFIN has no
// transfer flag, and transfers are not matched up across accounts.
var transferDescriptions = regexp.MustCompile(`(?i)` + `\b(trans|transfer|xfer|xfr)\b` +
	`|\bpayment made by account\b` +
	`|\bpayment\s*:\s*principal\b` +
	`|\bpayment,?\s*-?\s*thank you\b` +
	`|\bautomatic payment\b` +
	`|\belan - web pymt\b`)

// LooksLikeTransfer reports whether a description reads as a transfer or a
// credit card payment
func LooksLikeTransfer(description string) bool {
	return transferDescriptions.MatchString(description)
}
