package membership

import (
	"strings"
	"testing"
)

func TestGenerateFriendCode(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 500; i++ {
		code, err := GenerateFriendCode()
		if err != nil {
			t.Fatal(err)
		}
		if len(code) != CodeLength {
			t.Fatalf("code %q has length %d, want %d", code, len(code), CodeLength)
		}
		for _, r := range code {
			if !strings.ContainsRune(codeAlphabet, r) {
				t.Fatalf("code %q contains %q outside the alphabet", code, r)
			}
		}
		if normalized, ok := NormalizeFriendCode(code); !ok || normalized != code {
			t.Fatalf("a generated code should normalize to itself: %q -> %q, %v", code, normalized, ok)
		}
		seen[code] = true
	}
	if len(seen) < 495 {
		t.Fatalf("only %d distinct codes in 500 draws; the generator isn't random enough", len(seen))
	}
}

func TestNormalizeFriendCode(t *testing.T) {
	tests := []struct {
		in     string
		want   string
		wantOK bool
	}{
		{"ABCDEFGH", "ABCDEFGH", true},
		{"abcd-efgh", "ABCDEFGH", true},
		{"  ABCD EFGH  ", "ABCDEFGH", true},
		{"6B8A3720", "6B8A3720", true}, // a code backfilled by the migration (hex, contains 0)
		{"ABCD-EFG", "", false},        // too short
		{"ABCD-EFGHJ", "", false},      // too long
		{"ABCD_EFGH", "", false},       // stray punctuation
		{"", "", false},
	}
	for _, tc := range tests {
		got, ok := NormalizeFriendCode(tc.in)
		if ok != tc.wantOK || got != tc.want {
			t.Errorf("NormalizeFriendCode(%q) = %q, %v; want %q, %v", tc.in, got, ok, tc.want, tc.wantOK)
		}
	}
}

func TestFormatFriendCode(t *testing.T) {
	if got := FormatFriendCode("ABCDEFGH"); got != "ABCD-EFGH" {
		t.Errorf("FormatFriendCode = %q", got)
	}
	if got := FormatFriendCode("short"); got != "short" {
		t.Errorf("a malformed code should pass through unchanged, got %q", got)
	}
}
