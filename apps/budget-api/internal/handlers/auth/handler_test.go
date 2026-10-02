package auth

import (
	"strings"
	"testing"
)

func TestNormalizeUsername(t *testing.T) {
	for in, want := range map[string]string{
		"Sam":                   "sam",
		"  sam.p-1_x  ":         "sam.p-1_x",
		"abc":                   "abc",
		"a1b":                   "a1b",
		strings.Repeat("a", 30): strings.Repeat("a", 30),
	} {
		if got, ok := normalizeUsername(in); !ok || got != want {
			t.Errorf("normalizeUsername(%q) = %q, %v; want %q", in, got, ok, want)
		}
	}
	for _, in := range []string{"", "ab", ".abc", "-abc", "_abc", "a b c", "sam@example.com", "sam!", "sam\nx", "ünï", strings.Repeat("a", 31)} {
		if got, ok := normalizeUsername(in); ok {
			t.Errorf("normalizeUsername(%q) accepted as %q", in, got)
		}
	}
}

func TestCleanTimezone(t *testing.T) {
	for in, ok := range map[string]bool{
		"":                      true,
		"America/New_York":      true,
		"Europe/London":         true,
		"Nowhere/Land":          false,
		"../../etc/passwd":      false,
		strings.Repeat("a", 60): false,
	} {
		if _, got := cleanTimezone(in); got != ok {
			t.Errorf("cleanTimezone(%q) ok = %v, want %v", in, got, ok)
		}
	}
	if tz, _ := cleanTimezone(""); tz != "America/Los_Angeles" {
		t.Errorf("blank timezone became %q", tz)
	}
}

func TestCleanName(t *testing.T) {
	if got, ok := cleanName("  Sam "); !ok || got != "Sam" {
		t.Errorf("cleanName = %q, %v", got, ok)
	}
	if _, ok := cleanName(strings.Repeat("é", 101)); ok {
		t.Error("101-character name accepted")
	}
}
