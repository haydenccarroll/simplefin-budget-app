package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// NewSessionToken returns a random session token (256 bits, URL-safe) and the
// hash to store. Only the hash is kept, so a copy of the database can't be
// used to sign in.
func NewSessionToken() (token, hash string, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", fmt.Errorf("generate session token: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	return token, HashToken(token), nil
}

// HashToken is how tokens and codes are stored: SHA-256, hex. That is enough
// for values that are random rather than chosen (unlike a password, there is
// nothing to guess offline).
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
