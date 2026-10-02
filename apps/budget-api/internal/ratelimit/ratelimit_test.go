package ratelimit

import (
	"testing"
	"time"
)

func TestCounter(t *testing.T) {
	now := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	c := New(3, time.Hour)
	c.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		if c.Blocked("a") {
			t.Fatalf("blocked after %d events, limit is 3", i)
		}
		c.Add("a")
	}
	if !c.Blocked("a") {
		t.Error("not blocked after 3 events")
	}
	if c.Blocked("b") {
		t.Error("one key's events blocked another")
	}

	c.Reset("a")
	if c.Blocked("a") {
		t.Error("still blocked after Reset")
	}

	c.Add("a")
	c.Add("a")
	c.Add("a")
	now = now.Add(time.Hour + time.Minute)
	if c.Blocked("a") {
		t.Error("still blocked after the window passed")
	}
	if len(c.events) != 0 {
		t.Errorf("expired events were kept: %v", c.events)
	}
}
