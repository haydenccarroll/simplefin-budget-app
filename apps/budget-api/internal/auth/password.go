// Package auth is the API's own authentication: password hashing, session
// tokens, and the middleware that turns a request's credentials into a user.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters, from OWASP's guidance for a server hashing passwords
// (19 MiB, 2 passes, 1 lane). They are written into every hash, so they can be
// raised later without invalidating old ones.
const (
	argonMemoryKiB = 19 * 1024
	argonTime      = 2
	argonThreads   = 1
	argonKeyLen    = 32
	argonSaltLen   = 16
)

// Password length limits. The floor is what a person can be asked to type; the
// ceiling stops someone submitting a megabyte to be hashed.
const (
	MinPasswordLength = 8
	MaxPasswordLength = 128
)

// ErrPasswordLength is returned for a password outside the allowed lengths.
var ErrPasswordLength = fmt.Errorf("password must be %d to %d characters", MinPasswordLength, MaxPasswordLength)

// CheckPasswordPolicy reports whether a new password is acceptable.
func CheckPasswordPolicy(password string) error {
	if n := len([]rune(password)); n < MinPasswordLength || n > MaxPasswordLength {
		return ErrPasswordLength
	}
	return nil
}

// HashPassword returns an encoded argon2id hash ("$argon2id$v=19$m=..,t=..,p=..$salt$hash").
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemoryKiB, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// ErrMismatch is returned when a password doesn't match a hash.
var ErrMismatch = errors.New("password does not match")

// VerifyPassword checks a password against an encoded hash in constant time.
func VerifyPassword(password, encoded string) error {
	parts := strings.Split(encoded, "$")
	// "", "argon2id", "v=19", "m=..,t=..,p=..", salt, hash
	if len(parts) != 6 || parts[1] != "argon2id" {
		return errors.New("unrecognized password hash")
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return errors.New("unsupported argon2 version")
	}
	var memory, time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return errors.New("malformed argon2 parameters")
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return errors.New("malformed salt")
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return errors.New("malformed hash")
	}
	got := argon2.IDKey([]byte(password), salt, time, memory, threads, uint32(len(want)))
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return ErrMismatch
	}
	return nil
}

// dummyHash is checked when a login names an account that doesn't exist, so
// that "no such account" takes as long as "wrong password".
var dummyHash = func() string {
	h, err := HashPassword("dummy password for timing")
	if err != nil {
		panic(err)
	}
	return h
}()

// BurnPasswordCheck spends the time of one password check.
func BurnPasswordCheck(password string) { _ = VerifyPassword(password, dummyHash) }
