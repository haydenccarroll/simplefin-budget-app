// Package ratelimit counts events per key over a sliding window, to slow down
// guessing (passwords, friend codes) and to cap how often an address can sign up.
//
// The counts live in this process, which bounds a single client; with several
// replicas the real ceiling is the limit times the replica count.
package ratelimit

import (
	"sync"
	"time"
)

// Counter counts events per key within a window.
type Counter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	events map[string][]time.Time
	now    func() time.Time
}

// New returns a Counter that reports a key as blocked once it has max events
// inside window.
func New(max int, window time.Duration) *Counter {
	return &Counter{max: max, window: window, events: make(map[string][]time.Time), now: time.Now}
}

// Window is how long an event counts for.
func (c *Counter) Window() time.Duration { return c.window }

// recent returns the events for key still inside the window, dropping the
// rest. Callers hold c.mu.
func (c *Counter) recent(key string) []time.Time {
	cutoff := c.now().Add(-c.window)
	kept := c.events[key][:0]
	for _, t := range c.events[key] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		delete(c.events, key)
		return nil
	}
	c.events[key] = kept
	return kept
}

// Blocked reports whether key has used up its events.
func (c *Counter) Blocked(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.recent(key)) >= c.max
}

// Add records one event for key.
func (c *Counter) Add(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events[key] = append(c.recent(key), c.now())
}

// Reset forgets key's events (e.g. after a successful login).
func (c *Counter) Reset(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.events, key)
}
